import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis";
import { refreshTeslaTokens } from "./auth";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

// Single-flight guard, per process. Necessary and not sufficient: /state,
// /commands and the cron each run in a different lambda, so this Map is empty
// in the instance that races the one holding it. Tesla ROTATES the refresh
// token on use, so a lost race does not just waste a call — the loser writes a
// token Tesla has already invalidated, and the next refresh fails with
// invalid_grant, which surfaces to the driver as "reconnect your Tesla".
//
// The cross-instance half is REFRESH_LOCK below.
const refreshInFlight = new Map<
  string,
  Promise<{ accessToken: string; region: string }>
>();

/**
 * Cross-instance refresh lock.
 *
 * Redis SET NX with a short TTL. The holder refreshes; everyone else waits for
 * the new row to appear rather than making a second call with a token that is
 * about to be revoked.
 *
 * Deliberately best-effort in both directions: with no Redis configured
 * (local, preview) acquire() returns true and the behaviour is exactly what it
 * was, and a waiter that times out refreshes anyway. A stuck lock must never
 * be able to lock a driver out of their car.
 */
const REFRESH_LOCK_TTL_S = 15;
const WAIT_STEPS_MS = [250, 500, 1000, 2000, 4000];

async function acquireRefreshLock(vehicleId: string): Promise<boolean> {
  if (!redis) return true;
  try {
    const res = await redis.set(`tesla:refresh:${vehicleId}`, "1", {
      nx: true,
      ex: REFRESH_LOCK_TTL_S,
    });
    return res === "OK";
  } catch {
    // Redis unreachable is not a reason to refuse to refresh.
    return true;
  }
}

async function releaseRefreshLock(vehicleId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(`tesla:refresh:${vehicleId}`);
  } catch {
    // The TTL cleans up.
  }
}

/**
 * Wait for whoever holds the lock to publish a fresher row.
 *
 * Returns the new access token, or null if it never appeared — in which case
 * the caller refreshes itself. Compares against the expiry we already read, so
 * "fresher" means strictly newer rather than merely present.
 */
async function awaitRefreshedToken(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  vehicleId: string,
  knownExpiresAt: number,
): Promise<string | null> {
  for (const delay of WAIT_STEPS_MS) {
    await new Promise((r) => setTimeout(r, delay));
    const { data } = await supabase
      .from("tesla_tokens")
      .select("access_token_enc, expires_at")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    const row = data as { access_token_enc: string; expires_at: string } | null;
    if (row && new Date(row.expires_at).getTime() > knownExpiresAt) {
      return decryptToken(row.access_token_enc);
    }
  }
  return null;
}

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
        const holdsLock = await acquireRefreshLock(vehicleId);
        if (!holdsLock) {
          const fresh = await awaitRefreshedToken(supabase, vehicleId, expiresAt);
          if (fresh) return { accessToken: fresh, region: vehicle.tesla_region };
          // The holder died or is slower than we can wait. Refreshing with a
          // possibly-rotated token risks invalid_grant, but refusing here
          // guarantees the command fails, so take the chance.
        }

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
        await releaseRefreshLock(vehicleId);
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
