import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { applyCapabilityMask } from "@/lib/brands/adapter-utils";
import { getBrand } from "@/lib/brands/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { isLiveEnabled } from "@/lib/live-integrations";
import { tick } from "@/lib/mock/engine";
import { loadSnapshot, saveSnapshot } from "@/lib/mock/persistence";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { fetchVehicleData } from "@/lib/tesla/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BrandKey } from "@/lib/brands/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }

  if (!checkRateLimit(session.user.id, "state", 120)) {
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
    if (vehicle.brand === "tesla" && vehicle.tesla_vehicle_id) {
      try {
        const state = await fetchVehicleData({
          vehicleId: vehicle.id,
          userId: session.user.id,
          teslaVehicleId: vehicle.tesla_vehicle_id,
          displayName: vehicle.display_name,
        });
        return NextResponse.json(state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Live fetch failed";
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
    await saveSnapshot(vehicleId, null, prev);
  }

  const next = tick(prev, new Date(), profile);
  await saveSnapshot(vehicleId, prev, next);

  const maskedState = applyCapabilityMask(next.state, profile.capabilities.telemetry);
  return NextResponse.json(maskedState);
}
