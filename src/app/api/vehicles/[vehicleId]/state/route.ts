import { NextResponse, after } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { applyCapabilityMask } from "@/lib/brands/adapter-utils";
import { getBrand } from "@/lib/brands/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { tick } from "@/lib/mock/engine";
import { loadSnapshot, saveSnapshot } from "@/lib/mock/persistence";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { seedMockHistory } from "@/lib/mock/seed-history";
import { recordBatteryHealth } from "@/lib/battery-health";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BrandKey } from "@/lib/brands/types";
import type { VehicleState } from "@/types/vehicle";

/**
 * Vehicle state — simulator only.
 *
 * The live Tesla path was removed with the integration; what remains is the
 * demo car. A vehicle still stored as `data_source = "live"` predates the
 * removal and is refused rather than handed to the simulator, which would
 * invent one.
 */
/**
 * A vehicle we hold a record for and take no readings from.
 *
 * Every telemetry field is null on purpose. `linkPaused` marks it so a screen
 * can say why rather than implying the reading is merely old.
 */
function noTelemetryState(vehicle: {
  id: string;
  brand: string;
  display_name: string;
}): VehicleState {
  const now = new Date().toISOString();
  return {
    vehicleId: vehicle.id,
    displayName: vehicle.display_name,
    brand: vehicle.brand as BrandKey,
    dataSource: "real",
    trimBadge: null,
    isOnline: false,
    lastSeenAt: null,
    batteryLevel: null,
    batteryRangeKm: null,
    chargeLimit: null,
    chargingState: null,
    chargingRateKw: null,
    chargeAmps: null,
    isChargePortOpen: null,
    timeToFullMinutes: null,
    scheduledChargingEnabled: null,
    scheduledChargingStartMinutes: null,
    scheduledDepartureEnabled: null,
    scheduledDepartureMinutes: null,
    batteryHealthPct: null,
    batteryChemistry: null,
    cellVoltages: null,
    motionState: null,
    odometerKm: null,
    speedKmh: null,
    headingDeg: null,
    latitude: null,
    longitude: null,
    interiorTempC: null,
    exteriorTempC: null,
    isClimateOn: null,
    driverTempC: null,
    passengerTempC: null,
    hvacMode: null,
    seatHeatingLevel: null,
    steeringHeating: null,
    isLocked: null,
    doorsOpen: null,
    windowsOpen: null,
    isTrunkOpen: null,
    isFrunkOpen: null,
    isSentryMode: null,
    isDashcamRecording: null,
    isRemoteStartActive: null,
    isBatteryPreconditioning: null,
    softwareVersion: null,
    updateAvailable: null,
    updateVersionLabel: null,
    serviceDueAt: null,
    tirePressures: null,
    safetyScore: null,
    efficiencyScore: null,
    recordedAt: now,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  // `cached=1` and `fresh=1` are still accepted and now mean nothing: they
  // steered a read of a real car, and there is no real car to read. Left
  // unread rather than rejected so an old client does not start erroring.
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
    .select(
      "id, brand, data_source, display_name, model",
    )
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

  // A car that was linked before the integration was withdrawn.
  //
  // It is not a simulator and must never be handed to one below — that path
  // calls createInitialSnapshot and would invent a battery level for a real
  // Model 3. But 503 was wrong too: the dashboard read it as "still trying" and
  // sat on "Contactăm mașina…" forever, contacting nothing, for a car nothing
  // will ever contact again.
  //
  // What it actually is now is a record with no telemetry — the thing documents,
  // costs and odometer readings hang off. So that is what it returns: the
  // identity we know, and null for every reading we do not. Screens already hide
  // null fields rather than substituting placeholders (see types/vehicle.ts), so
  // an honest empty is rendered without any of them needing a special case.
  if (vehicle.data_source === "real") {
    return NextResponse.json(noTelemetryState(vehicle));
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
