import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Record today's SoH for a vehicle (idempotent per day). On the very first
 * record for a vehicle, backfill 12 monthly points trending gently down to the
 * current value so the degradation chart is meaningful immediately — batteries
 * were healthier when newer. For mock vehicles this is simulated history,
 * consistent with the rest of the Tier-3 simulator.
 */
export async function recordBatteryHealth(
  supabase: AdminClient,
  vehicleId: string,
  sohPct: number,
): Promise<void> {
  const today = new Date();

  const { count } = await supabase
    .from("battery_health_history")
    .select("*", { count: "exact", head: true })
    .eq("vehicle_id", vehicleId);

  if ((count ?? 0) === 0) {
    // Backfill ~0.25%/month of prior degradation, oldest first.
    const rows: { vehicle_id: string; recorded_date: string; soh_pct: number }[] = [];
    for (let monthsAgo = 12; monthsAgo >= 1; monthsAgo--) {
      const d = new Date(today);
      d.setMonth(d.getMonth() - monthsAgo);
      rows.push({
        vehicle_id: vehicleId,
        recorded_date: isoDate(d),
        soh_pct: Math.round((sohPct + monthsAgo * 0.25) * 100) / 100,
      });
    }
    await supabase.from("battery_health_history").insert(rows);
  }

  await supabase
    .from("battery_health_history")
    .upsert(
      { vehicle_id: vehicleId, recorded_date: isoDate(today), soh_pct: Math.round(sohPct * 100) / 100 },
      { onConflict: "vehicle_id,recorded_date", ignoreDuplicates: false },
    );
}
