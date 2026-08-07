import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/lib/auth";
import { errorContext, logServer } from "@/lib/debug-log";
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
  } catch (err) {
    logServer("error", "tesla/callback", "token exchange failed", errorContext(err));
    return NextResponse.redirect(
      new URL("/connect/tesla?error=token_exchange", req.url),
    );
  }

  // Try each region to find which one knows this account.
  const regions: TeslaRegion[] = ["eu", "na", "cn"];
  let foundRegion: TeslaRegion | null = null;
  let vehicle: { id: number; vin: string; display_name: string } | null = null;

  // Two very different failures used to look identical here — an account with
  // no cars, and the Fleet API refusing us because the partner account is not
  // registered (which it is not until TESLA_PUBLIC_KEY is served and
  // /api/1/partner_accounts has been called). Both ended as `no_vehicles` with
  // every error swallowed, so linking appeared to succeed and the app quietly
  // kept showing the mock vehicle. Record which one it was.
  const regionErrors: Record<string, unknown> = {};

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
      regionErrors[region] = "reachable, but the account has no vehicles here";
    } catch (err) {
      regionErrors[region] = err instanceof Error ? err.message : String(err);
    }
  }

  if (!foundRegion || !vehicle) {
    const everyRegionErrored = regions.every(
      (r) => typeof regionErrors[r] === "string" && !String(regionErrors[r]).startsWith("reachable"),
    );
    logServer("error", "tesla/callback", "no vehicle found after linking", {
      regions: regionErrors,
      // The likeliest cause by far, and not something the Tesla error text says.
      hint: everyRegionErrored
        ? "every region rejected the call — check the partner account is registered and TESLA_PUBLIC_KEY is served"
        : "the account appears to have no vehicles",
    });
    return NextResponse.redirect(
      new URL(
        `/connect/tesla?error=${everyRegionErrored ? "fleet_api_rejected" : "no_vehicles"}`,
        req.url,
      ),
    );
  }

  const supabase = createSupabaseAdminClient();

  // Ensure profile exists (it should, via trigger, but be defensive).
  await supabase
    .from("profiles")
    .upsert({ id: session.user.id }, { onConflict: "id" });

  // data_source MUST be set. The column defaults to 'mock' (migration 002), and
  // the state route takes the live path only when it reads 'live' — so a
  // successfully linked car was being handed to the simulator, showing Prague
  // and 15 degrees to a driver in Greece. Linking looked like it worked because
  // it did; only this one field was missing.
  const fields = {
    brand: "tesla",
    display_name: vehicle.display_name,
    vin: vehicle.vin,
    tesla_vehicle_id: vehicle.id,
    tesla_region: foundRegion,
    data_source: "live" as const,
    is_active: true,
  };

  // Linking again — after a failure, or to re-authorise — must not add a second
  // copy of the same car. Matched on the Tesla id rather than the VIN because
  // that is what every later API call keys on.
  const { data: existingVehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("tesla_vehicle_id", vehicle.id)
    .maybeSingle();

  const { data: createdVehicle, error: vehErr } = existingVehicle
    ? await supabase
        .from("vehicles")
        .update(fields)
        .eq("id", existingVehicle.id)
        .eq("user_id", session.user.id)
        .select("id")
        .single()
    : await supabase
        .from("vehicles")
        .insert({ user_id: session.user.id, ...fields })
        .select("id")
        .single();

  if (vehErr || !createdVehicle) {
    logServer("error", "tesla/callback", "vehicle insert failed", {
      detail: vehErr?.message ?? "no row returned",
    });
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
