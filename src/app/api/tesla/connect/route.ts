import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/lib/auth";
import { isLiveEnabled } from "@/lib/live-integrations";
import {
  buildTeslaAuthorizeUrl,
  generatePkcePair,
  generateState,
} from "@/lib/tesla/auth";

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

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateState();

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };
  cookieStore.set("tesla_pkce_verifier", codeVerifier, cookieOpts);
  cookieStore.set("tesla_oauth_state", state, cookieOpts);

  const url = buildTeslaAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
  });

  return NextResponse.redirect(url);
}
