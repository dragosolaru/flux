import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/lib/auth";
import { isLiveEnabled } from "@/lib/live-integrations";
import { exchangeCodeForTokens, verifyState } from "@/lib/tesla/auth";
import { fetchVehicleList } from "@/lib/tesla/api";
import { encryptToken } from "@/lib/tesla/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { TeslaRegion } from "@/types/tesla";

export async function GET(req: NextRequest) {
  if (!isLiveEnabled("tesla")) {
    return NextResponse.json({ message: "Tesla live integration is not enabled" }, { status: 410 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/connect/tesla?error=missing_params", req.url),
    );
  }

  const cookieStore = await cookies();
  const verifier = cookieStore.get("tesla_pkce_verifier")?.value;

  // State is self-verifying — HMAC keyed to the current user's session ID.
  // Even if an attacker pre-seeded cookies, the HMAC will not match for a
  // different session. Comparison inside verifyState is constant-time.
  // verifyState can throw if NEXTAUTH_SECRET is missing — treat as mismatch.
  let stateValid = false;
  try { stateValid = verifyState(state, session.user.id); } catch { stateValid = false; }
  if (!verifier || !stateValid) {
    return NextResponse.redirect(
      new URL("/connect/tesla?error=state_mismatch", req.url),
    );
  }

  cookieStore.delete("tesla_pkce_verifier");

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: verifier,
      clientId: process.env.TESLA_CLIENT_ID!,
      clientSecret: process.env.TESLA_CLIENT_SECRET!,
      redirectUri: process.env.TESLA_REDIRECT_URI!,
    });
  } catch {
    return NextResponse.redirect(
      new URL("/connect/tesla?error=token_exchange", req.url),
    );
  }

  // Try each region to find which one knows this account.
  const regions: TeslaRegion[] = ["eu", "na", "cn"];
  let foundRegion: TeslaRegion | null = null;
  let vehicle: { id: number; vin: string; display_name: string } | null = null;

  for (const region of regions) {
    try {
      const list = await fetchVehicleList({
        accessToken: tokens.access_token,
        region,
      });
      if (list.response && list.response.length > 0) {
        foundRegion = region;
        const first = list.response[0];
        vehicle = {
          id: first.id,
          vin: first.vin,
          display_name: first.display_name,
        };
        break;
      }
    } catch {
      // Try next region.
    }
  }

  if (!foundRegion || !vehicle) {
    return NextResponse.redirect(
      new URL("/connect/tesla?error=no_vehicles", req.url),
    );
  }

  const supabase = createSupabaseAdminClient();

  // Ensure profile exists (it should, via trigger, but be defensive).
  await supabase
    .from("profiles")
    .upsert({ id: session.user.id }, { onConflict: "id" });

  const { data: createdVehicle, error: vehErr } = await supabase
    .from("vehicles")
    .insert({
      user_id: session.user.id,
      brand: "tesla",
      display_name: vehicle.display_name,
      vin: vehicle.vin,
      tesla_vehicle_id: vehicle.id,
      tesla_region: foundRegion,
      is_active: true,
    })
    .select("id")
    .single();

  if (vehErr || !createdVehicle) {
    return NextResponse.redirect(
      new URL("/connect/tesla?error=vehicle_save", req.url),
    );
  }

  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  const { error: tokErr } = await supabase.from("tesla_tokens").insert({
    vehicle_id: createdVehicle.id,
    user_id: session.user.id,
    access_token_enc: encryptToken(tokens.access_token),
    refresh_token_enc: encryptToken(tokens.refresh_token),
    expires_at: expiresAt,
    scopes: ["openid", "offline_access", "vehicle_device_data", "vehicle_cmds"],
  });

  if (tokErr) {
    return NextResponse.redirect(
      new URL("/connect/tesla?error=token_save", req.url),
    );
  }

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
