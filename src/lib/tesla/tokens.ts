import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { refreshTeslaTokens } from "./auth";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

// Single-flight guard: if two requests both see an expiring token, only one
// refresh races to Tesla. Tesla rotates refresh tokens on use, so the last
// DB write would desync the stored token otherwise.
const refreshInFlight = new Map<
  string,
  Promise<{ accessToken: string; region: string }>
>();

function getKey(): Buffer {
  const hex = process.env.TESLA_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("TESLA_TOKEN_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `TESLA_TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars); got ${key.length}`,
    );
  }
  return key;
}

/**
 * Validates the encryption key without performing any crypto operation.
 * Call from OAuth entry points so misconfiguration fails the request before
 * the user authorizes — rather than crashing in the callback after consent.
 */
export function assertTeslaEncryptionKey(): void {
  getKey();
}

/**
 * Encrypts a token using AES-256-GCM. Output format: base64(iv:authTag:ciphertext).
 * IV is generated per-call and prepended to the output.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptToken(encrypted: string): string {
  const key = getKey();
  const raw = Buffer.from(encrypted, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
  const ct = raw.subarray(IV_BYTES + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Returns a valid access token for the given vehicle, refreshing if needed.
 * Updates the DB in place when a refresh occurs.
 * userId is required for ownership verification (defense-in-depth).
 */
/**
 * The driver's Tesla authorisation is gone — revoked from their Tesla account,
 * expired beyond refresh, or never stored.
 *
 * Distinct from "the car did not answer", because the remedies are opposite:
 * an unreachable car is worth retrying, a revoked token never will be. They
 * were indistinguishable, so revoking access from tesla.com produced "check
 * your connection and try again" — advice that cannot work.
 */
export class TeslaAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeslaAuthError";
  }
}

export async function getValidAccessToken(
  vehicleId: string,
  userId: string,
): Promise<{ accessToken: string; region: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: vehicle, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, tesla_region")
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .single();
  if (vehErr || !vehicle) throw new Error("Vehicle not found");

  const { data: tokenRow, error: tokErr } = await supabase
    .from("tesla_tokens")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("vehicle_id", vehicleId)
    .single();
  if (tokErr || !tokenRow) throw new TeslaAuthError("No Tesla token for vehicle");

  const expiresAt = new Date(tokenRow.expires_at).getTime();
  // Refresh if expiring in the next 60s.
  if (Date.now() >= expiresAt - 60_000) {
    const existing = refreshInFlight.get(vehicleId);
    if (existing) return existing;

    const refreshPromise = (async () => {
      try {
        const refreshToken = decryptToken(tokenRow.refresh_token_enc);
        let fresh;
        try {
          fresh = await refreshTeslaTokens({
            refreshToken,
            clientId: process.env.TESLA_CLIENT_ID!,
          });
        } catch (err) {
          // Tesla answers a revoked or expired refresh token with 400
          // invalid_grant. That is not a transient failure: no amount of
          // retrying brings it back, only the driver re-authorising. Everything
          // upstream treated it as "the car did not answer".
          const msg = err instanceof Error ? err.message : String(err);
          if (/\b(400|401)\b/.test(msg) || /invalid_grant|login_required/i.test(msg)) {
            throw new TeslaAuthError(`Tesla authorisation is no longer valid: ${msg}`);
          }
          throw err;
        }

        const newAccessEnc = encryptToken(fresh.access_token);
        const newRefreshEnc = encryptToken(fresh.refresh_token);
        const newExpiresAt = new Date(
          Date.now() + fresh.expires_in * 1000,
        ).toISOString();

        await supabase
          .from("tesla_tokens")
          .update({
            access_token_enc: newAccessEnc,
            refresh_token_enc: newRefreshEnc,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("vehicle_id", vehicleId);

        return { accessToken: fresh.access_token, region: vehicle.tesla_region };
      } finally {
        refreshInFlight.delete(vehicleId);
      }
    })();

    refreshInFlight.set(vehicleId, refreshPromise);
    return refreshPromise;
  }

  return {
    accessToken: decryptToken(tokenRow.access_token_enc),
    region: vehicle.tesla_region,
  };
}
