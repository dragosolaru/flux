import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/lib/auth";
import { isLiveEnabled } from "@/lib/live-integrations";
import {
  buildTeslaAuthorizeUrl,
  generatePkcePair,
  generateState,
} from "@/lib/tesla/auth";
import { assertTeslaEncryptionKey } from "@/lib/tesla/tokens";

export async function GET() {
  if (!isLiveEnabled("tesla")) {
    return NextResponse.json({ message: "Tesla live integration is not enabled" }, { status: 410 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.TESLA_CLIENT_ID;
  const redirectUri = process.env.TESLA_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { message: "Tesla OAuth is not configured" },
      { status: 500 },
    );
  }

  // Fail fast if the encryption key is misconfigured — better to error here
  // than half-way through OAuth callback after the user has authorized.
  try {
    assertTeslaEncryptionKey();
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Tesla encryption misconfigured" },
      { status: 500 },
    );
  }

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateState(session.user.id);

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };
  cookieStore.set("tesla_pkce_verifier", codeVerifier, cookieOpts);
  // We no longer need to persist state in a cookie — it's self-verifying via
  // the HMAC against session.user.id. Keep verifier (PKCE requires it).

  const url = buildTeslaAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
  });

  return NextResponse.redirect(url);
}
