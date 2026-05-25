import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isLiveEnabled } from "@/lib/live-integrations";
import { fetchTeslaChargingHistory } from "@/lib/tesla/charging-history";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(
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
  const supabase = createSupabaseAdminClient();

  const { data: vehicle, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, brand, data_source, tesla_vehicle_id, user_id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (vehErr || !vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  if (!isLiveEnabled(vehicle.brand) || vehicle.data_source !== "live") {
    return NextResponse.json({ message: "Only available for live vehicles" }, { status: 400 });
  }

  if (vehicle.brand !== "tesla" || !vehicle.tesla_vehicle_id) {
    return NextResponse.json({ message: "Tesla vehicle required" }, { status: 400 });
  }

  try {
    const sessions = await fetchTeslaChargingHistory({
      vehicleId: vehicle.id,
      teslaVehicleId: vehicle.tesla_vehicle_id,
    });

    // Upsert into charging_sessions (only columns that exist in the schema)
    let inserted = 0;
    for (const s of sessions) {
      const startedAt = new Date(s.chargeStartDateTime).toISOString();
      const endedAt = new Date(s.chargeStopDateTime).toISOString();

      const { error } = await supabase
        .from("charging_sessions")
        .upsert(
          {
            vehicle_id: vehicle.id,
            started_at: startedAt,
            ended_at: endedAt,
            energy_added_kwh: s.chargeEnergyAddedKwh,
            location_name: s.siteLocationName ?? null,
            cost_eur: s.fees?.currencyCode === "EUR" ? s.fees.totalDue : null,
          },
          {
            onConflict: "vehicle_id,started_at",
            ignoreDuplicates: true,
          },
        );
      if (!error) inserted++;
    }

    return NextResponse.json({ synced: inserted, total: sessions.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ message: msg }, { status: 502 });
  }
}
