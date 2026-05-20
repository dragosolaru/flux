import { createSupabaseAdminClient } from "@/lib/supabase/server";

interface AttributionResult {
  vehicleKwh: number;
  vehicleCostRon: number;
  fraction: number;
  sessionCount: number;
}

export async function attributeHomeBill(
  vehicleId: string,
  periodStart: Date,
  periodEnd: Date,
  totalKwh: number,
  costRon: number,
): Promise<AttributionResult> {
  const supabase = createSupabaseAdminClient();

  const { data: sessions } = await supabase
    .from("charging_sessions")
    .select("energy_added_kwh")
    .eq("vehicle_id", vehicleId)
    .is("network", null)
    .gte("started_at", periodStart.toISOString())
    .lte("started_at", periodEnd.toISOString());

  const vehicleKwh = (sessions ?? []).reduce(
    (sum: number, s: { energy_added_kwh: number | null }) =>
      sum + (s.energy_added_kwh ?? 0),
    0,
  );

  const fraction = totalKwh > 0 ? Math.min(vehicleKwh / totalKwh, 1) : 0;
  const vehicleCostRon = costRon * fraction;

  return {
    vehicleKwh,
    vehicleCostRon,
    fraction,
    sessionCount: (sessions ?? []).length,
  };
}
