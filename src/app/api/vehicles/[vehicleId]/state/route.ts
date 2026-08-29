import { NextResponse, after } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { applyCapabilityMask } from "@/lib/brands/adapter-utils";
import { getBrand } from "@/lib/brands/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { isLiveEnabled } from "@/lib/live-integrations";
import { tick } from "@/lib/mock/engine";
import { loadSnapshot, saveSnapshot } from "@/lib/mock/persistence";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { seedMockHistory } from "@/lib/mock/seed-history";
import { recordBatteryHealth } from "@/lib/battery-health";
import { fetchVehicleData, TeslaAsleepError } from "@/lib/tesla/api";
import { loadLastKnown, saveLastKnown } from "@/lib/tesla/last-known";
import { TeslaAuthError } from "@/lib/tesla/tokens";
import { errorContext, recordDebugLog } from "@/lib/debug-log";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BrandKey } from "@/lib/brands/types";

/**
 * @query cached=1  answer from what we already stored and never contact the
 *   car — not even to ask whether it is awake.
 *
 *   This is what "let it sleep" means. It used to be enforced in the client by
 *   refusing to fetch at all, which stopped us reading our OWN database too:
 *   the screen then had no values, so it printed "contacting the car" while
 *   deliberately contacting nothing. Leaving the car alone and having nothing
 *   to show are two different things, and only one of them is desirable.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const query = new URL(req.url).searchParams;
  const cachedOnly = query.get("cached") === "1";
  // A tap on "refresh" is the one read that skips the shared 30s window and is
  // never refused by the daily ceiling. Everything else is a screen wanting a
  // reading to render, which is exactly the traffic the window is for.
  const deliberate = query.get("fresh") === "1";
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "state", 120))) {
    return NextResponse.json(
      { message: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: vehicle, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, brand, data_source, display_name, model, tesla_vehicle_id, tesla_region")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (vehErr || !vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  const profile = getBrand(vehicle.brand);
  if (!profile) {
    return NextResponse.json({ message: "unknown-brand" }, { status: 400 });
  }

  // Live path: brand is in LIVE_INTEGRATIONS and vehicle is marked live
  if (isLiveEnabled(vehicle.brand) && vehicle.data_source === "live") {
    if (cachedOnly) {
      // Not a fetch that happens to hit a cache — a promise not to reach for
      // the car. Answered from vehicle_snapshots or not at all.
      const lastKnown = await loadLastKnown(supabase, {
        id: vehicle.id,
        brand: vehicle.brand,
        display_name: vehicle.display_name,
      });
      if (lastKnown) return NextResponse.json(lastKnown);
      return NextResponse.json(
        { message: "No stored reading", code: "NO_CACHED_STATE" },
        { status: 503 },
      );
    }
    if (vehicle.brand === "tesla" && vehicle.tesla_vehicle_id) {
      try {
        // allowWake is NOT passed: a background read must never pull a parked
        // car out of sleep. Waking is what POST /wake is for, and only a
        // driver's tap reaches it.
        const state = await fetchVehicleData({
        reason: deliberate ? "user-action" : "screen",
          vehicleId: vehicle.id,
          userId: session.user.id,
          teslaVehicleId: vehicle.tesla_vehicle_id,
          displayName: vehicle.display_name,
        });
        // Stored so the next read of a sleeping car has something true to
        // return instead of having to wake it.
        after(saveLastKnown(supabase, vehicle.id, state).catch((err: unknown) => {
          console.error("[saveLastKnown]", vehicle.id, err);
        }));
        if (state.batteryHealthPct != null) {
          const soh = state.batteryHealthPct;
          after(recordBatteryHealth(supabase, vehicle.id, soh).catch((err: unknown) => {
            console.error("[recordBatteryHealth]", vehicle.id, err);
          }));
        }
        return NextResponse.json(state);
      } catch (err) {
        // Asleep is not a failure — it is the normal state of a parked car.
        // Hand back what it last told us, with isOnline false and the age of
        // the reading on it, and let the screen say so.
        if (err instanceof TeslaAsleepError) {
          const lastKnown = await loadLastKnown(supabase, {
            id: vehicle.id,
            brand: vehicle.brand,
            display_name: vehicle.display_name,
          });
          if (lastKnown) return NextResponse.json(lastKnown);
          return NextResponse.json(
            { message: "Vehicle is asleep", code: "VEHICLE_ASLEEP" },
            { status: 503 },
          );
        }
        const msg = err instanceof Error ? err.message : "Live fetch failed";
        // A revoked authorisation and an unreachable car both used to return
        // 502 "Live fetch failed", so the app told someone who had revoked
        // access from their Tesla account to check their connection and retry
        // — advice that can never work. They need to re-link, and nothing else.
        if (err instanceof TeslaAuthError) {
          recordDebugLog("warn", "vehicles/state", "Tesla authorisation is gone", {
            vehicleId: vehicle.id,
          });
          // 409, not 401: apiFetch redirects to /login on any 401, so returning
          // one here would sign the driver out of Flux entirely because their
          // TESLA authorisation lapsed. Two unrelated identities, one status
          // code.
          return NextResponse.json(
            { message: msg, code: "TESLA_REAUTH_REQUIRED" },
            { status: 409 },
          );
        }
        recordDebugLog("error", "vehicles/state", "live fetch failed", errorContext(err));
        return NextResponse.json({ message: msg }, { status: 502 });
      }
    }
    return NextResponse.json({ message: "Live adapter not available for this brand" }, { status: 501 });
  }

  // Mock path: tick the simulator to now
  let prev = await loadSnapshot(vehicleId);
  if (!prev) {
    prev = createInitialSnapshot(
      vehicleId,
      vehicle.display_name,
      vehicle.brand as BrandKey,
      "commuter",
      vehicle.model ?? null,
    );

    // First-ever access: backfill ~12 months of demo history so Insights and
    // Costs aren't empty. Start the live odometer from the seeded total.
    if (prev.vehicleSpec) {
      try {
        const seededKm = await seedMockHistory(
          supabase,
          vehicleId,
          session.user.id,
          prev.vehicleSpec,
          prev.state.latitude ?? 48,
          prev.state.longitude ?? 16,
        );
        prev.state.odometerKm = seededKm;
      } catch (err) {
        console.error("[seedMockHistory]", vehicleId, err);
      }
    }

    await saveSnapshot(vehicleId, null, prev);
  }

  const next = tick(prev, new Date(), profile);
  await saveSnapshot(vehicleId, prev, next);

  const maskedState = applyCapabilityMask(next.state, profile.capabilities.telemetry);

  if (maskedState.batteryHealthPct != null) {
    const soh = maskedState.batteryHealthPct;
    after(recordBatteryHealth(supabase, vehicleId, soh).catch((err: unknown) => {
      console.error("[recordBatteryHealth]", vehicleId, err);
    }));
  }

  return NextResponse.json(maskedState);
}
