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

/**
 * Vehicle state — simulator only.
 *
 * The live Tesla path was removed with the integration; what remains is the
 * demo car. A vehicle still stored as `data_source = "live"` predates the
 * removal and is refused rather than handed to the simulator, which would
 * invent one.
 */
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

  // The live path is gone. A vehicle stored as `live` predates the Tesla
  // integration being withdrawn, and it must not be handed to the simulator
  // below — that path calls createInitialSnapshot and would invent a car,
  // showing a fabricated battery level to the owner of a real one.
  if (vehicle.data_source === "live") {
    return NextResponse.json(
      { message: "Vehicle link is not available", code: "LIVE_PAUSED" },
      { status: 503 },
    );
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
