import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { isLiveEnabled } from "@/lib/live-integrations";
import { fetchVehicleData } from "@/lib/tesla/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const querySchema = z.object({
  vehicleId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  if (!isLiveEnabled("tesla")) {
    return NextResponse.json({ message: "Tesla live integration is not enabled" }, { status: 410 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    vehicleId: searchParams.get("vehicleId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  let vehicleQuery = supabase
    .from("vehicles")
    .select("id, tesla_vehicle_id, display_name, user_id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .limit(1);

  if (parsed.data.vehicleId) {
    vehicleQuery = supabase
      .from("vehicles")
      .select("id, tesla_vehicle_id, display_name, user_id")
      .eq("user_id", session.user.id)
      .eq("id", parsed.data.vehicleId);
  }

  const { data: vehicle, error: vehErr } = await vehicleQuery.maybeSingle();
  if (vehErr || !vehicle) {
    return NextResponse.json(
      { message: "Vehicle not found" },
      { status: 404 },
    );
  }

  if (!vehicle.tesla_vehicle_id) {
    return NextResponse.json(
      { message: "Vehicle has no Tesla ID" },
      { status: 422 },
    );
  }

  try {
    const state = await fetchVehicleData({
      vehicleId: vehicle.id,
      teslaVehicleId: vehicle.tesla_vehicle_id,
      displayName: vehicle.display_name,
    });

    // Fire-and-forget snapshot write — don't block the response.
    void supabase.from("vehicle_snapshots").insert({
      vehicle_id: vehicle.id,
      battery_level: state.batteryLevel,
      battery_range_km: state.batteryRangeKm,
      odometer_km: state.odometerKm,
      interior_temp_c: state.interiorTempC,
      exterior_temp_c: state.exteriorTempC,
      is_locked: state.isLocked,
      is_charging: state.chargingState === "charging",
      charging_rate_kw: state.chargingRateKw,
      latitude: state.latitude,
      longitude: state.longitude,
    });

    return NextResponse.json(state);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch vehicle data";
    return NextResponse.json({ message }, { status: 502 });
  }
}
