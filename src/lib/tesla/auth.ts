import { randomBytes, createHash } from "node:crypto";

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

export function generateState() {
  return base64UrlEncode(randomBytes(24));
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
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId,
    refresh_token: params.refreshToken,
    scope: TESLA_SCOPES,
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
