import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { TESLA_REGIONS } from "@/lib/tesla/constants";
import type { TeslaRegion } from "@/types/tesla";
import { getValidAccessToken, TeslaAuthError } from "@/lib/tesla/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { recordDebugLog } from "@/lib/debug-log";
import { isLiveEnabled } from "@/lib/live-integrations";

// Asks Tesla whether the car is paired with OUR key.
//
// Every other pairing signal in this app is an inference. `virtual_key_paired`
// is set when a signed command succeeds, so it can only ever confirm success
// after the fact. The car's own screen shows a key was added but not whose. And
// the failure string — "your public key has not been paired with the vehicle" —
// comes from the proxy, which knows only that the car refused it.
//
// `fleet_status` is the one authoritative answer: Tesla returns the VIN in
// `key_paired_vins` or in `unpaired_vins`, judged against the public key
// registered for this partner domain. Days were spent re-pairing a car that
// this call would have described in one press.
//
// It also returns `vehicle_command_protocol_required` per VIN, which decides
// whether commands must go through the signing proxy at all.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FleetStatusResponse {
  response?: {
    key_paired_vins?: string[];
    unpaired_vins?: string[];
    vehicle_info?: Record<
      string,
      {
        firmware_version?: string;
        vehicle_command_protocol_required?: boolean;
        fleet_telemetry_version?: string;
      }
    >;
  };
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  // Reaches Tesla, so it answers to LIVE_INTEGRATIONS like every other path
  // that does. fleet_status is a billable request; being admin-only made this
  // feel exempt, and the owner is exactly the person whose car is linked.
  if (!isLiveEnabled("tesla")) {
    return NextResponse.json({ message: "live-disabled" }, { status: 503 });
  }

  if (!(await checkRateLimit(admin.userId, "debug-fleet-status", 20))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, display_name, vin, tesla_region")
    .eq("user_id", admin.userId)
    .eq("brand", "tesla")
    .eq("data_source", "live")
    .eq("is_active", true);

  const live = (vehicles ?? []).filter((v) => v.vin && v.vin.length === 17);
  if (live.length === 0) {
    return NextResponse.json({
      ok: false,
      cars: [],
      hint: "No active live Tesla with a 17-character VIN. Link a car first.",
    });
  }

  // One call per car with that car's own token. They are separate OAuth grants,
  // so batching every VIN into one request would be answered for whichever
  // grant happened to be used and quietly omit the rest.
  const cars = await Promise.all(
    live.map(async (v) => {
      const vin = v.vin as string;
      try {
        const { accessToken, region } = await getValidAccessToken(v.id, admin.userId);
        const audience = TESLA_REGIONS[region as TeslaRegion] ?? TESLA_REGIONS.eu;
        const res = await fetch(`${audience}/api/1/vehicles/fleet_status`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ vins: [vin] }),
          signal: AbortSignal.timeout(20_000),
        });
        const text = await res.text();
        if (!res.ok) {
          return {
            vehicle: v.display_name,
            vin,
            paired: null,
            error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
          };
        }
        const body = JSON.parse(text) as FleetStatusResponse;
        const info = body.response?.vehicle_info?.[vin];
        return {
          vehicle: v.display_name,
          vin,
          // Explicitly three-valued. Tesla listing the VIN in neither array is
          // not the same as saying "unpaired", and collapsing it to false would
          // send the owner to re-pair a car Tesla never had an opinion on.
          paired: body.response?.key_paired_vins?.includes(vin)
            ? true
            : body.response?.unpaired_vins?.includes(vin)
              ? false
              : null,
          firmware: info?.firmware_version ?? null,
          commandProtocolRequired: info?.vehicle_command_protocol_required ?? null,
          fleetTelemetry: info?.fleet_telemetry_version ?? null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          vehicle: v.display_name,
          vin,
          paired: null,
          error: err instanceof TeslaAuthError ? `authorisation gone: ${msg}` : msg.slice(0, 200),
        };
      }
    }),
  );

  const unpaired = cars.filter((c) => c.paired === false);
  if (unpaired.length) {
    recordDebugLog("warn", "tesla/fleet-status", "Tesla reports the car is not paired", {
      vins: unpaired.map((c) => c.vin.slice(-6)),
    });
  }

  return NextResponse.json({
    ok: cars.some((c) => c.paired === true),
    cars,
    hint: cars.some((c) => c.paired === false)
      ? "Tesla says this car is NOT paired with the key registered for this domain. Open the Virtual Key link on the phone that owns the car and add the key."
      : cars.every((c) => c.paired === true)
        ? "Tesla says the car IS paired with the key registered for this domain. If commands still fail, the proxy is signing with a different private key than the one this domain publishes."
        : "Tesla did not classify the VIN either way — check the per-car error.",
  });
}
