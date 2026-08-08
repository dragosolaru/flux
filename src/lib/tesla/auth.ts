import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

import { TESLA_AUTH_URL, TESLA_SCOPES, TESLA_TOKEN_URL } from "./constants";
import type { TeslaTokenResponse } from "@/types/tesla";

/**
 * PKCE pair. Tesla requires PKCE on the OAuth authorization request.
 */
export function generatePkcePair() {
  const codeVerifier = base64UrlEncode(randomBytes(64));
  const codeChallenge = base64UrlEncode(
    createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

/**
 * OAuth state bound to the user ID via HMAC.
 * Format: base64url(nonce):base64url(hmac(nonce + userId))
 *
 * The callback verifies the HMAC with the current session's userId — even if
 * an attacker pre-seeded the state cookie, the HMAC won't match for a different
 * user's session. Uses NEXTAUTH_SECRET as the HMAC key (already a startup
 * requirement of the app).
 */
function stateSecret(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for OAuth state binding");
  return Buffer.from(secret);
}

export function generateState(userId: string): string {
  const nonce = randomBytes(24);
  const hmac = createHmac("sha256", stateSecret())
    .update(nonce)
    .update(userId)
    .digest();
  return `${base64UrlEncode(nonce)}.${base64UrlEncode(hmac)}`;
}

export function verifyState(state: string, userId: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 2) return false;
  const nonce = base64UrlDecode(parts[0]);
  const claimedHmac = base64UrlDecode(parts[1]);
  const expectedHmac = createHmac("sha256", stateSecret())
    .update(nonce)
    .update(userId)
    .digest();
  if (claimedHmac.length !== expectedHmac.length) return false;
  return timingSafeEqual(claimedHmac, expectedHmac);
}

export function buildTeslaAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const url = new URL(TESLA_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", TESLA_SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TeslaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    audience: "https://fleet-api.prd.na.vn.cloud.tesla.com",
  });

  const res = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tesla token exchange failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as TeslaTokenResponse;
}

export async function refreshTeslaTokens(params: {
  refreshToken: string;
  clientId: string;
}): Promise<TeslaTokenResponse> {
  // No `scope` here on purpose. OAuth lets a refresh narrow the grant but never
  // widen it, and the consent screen lets the driver untick any permission —
  // so pinning the full TESLA_SCOPES list meant that anyone who granted a
  // subset had every refresh rejected. Omitted, the grant refreshes as issued.
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId,
    refresh_token: params.refreshToken,
  });

  const res = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tesla token refresh failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as TeslaTokenResponse;
}

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}
