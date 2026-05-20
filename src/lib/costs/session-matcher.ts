import { createSupabaseAdminClient } from "@/lib/supabase/server";

interface MatchResult {
  sessionId: string;
  deltaMinutes: number;
}

export async function matchChargingSession(
  vehicleId: string,
  timestamp: Date,
  toleranceMinutes = 15,
): Promise<MatchResult | null> {
  const supabase = createSupabaseAdminClient();

  const lower = new Date(timestamp.getTime() - toleranceMinutes * 60_000);
  const upper = new Date(timestamp.getTime() + toleranceMinutes * 60_000);

  const { data } = await supabase
    .from("charging_sessions")
    .select("id, started_at")
    .eq("vehicle_id", vehicleId)
    .gte("started_at", lower.toISOString())
    .lte("started_at", upper.toISOString())
    .order("started_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return null;

  // Pick the session with smallest delta
  let best: MatchResult | null = null;
  for (const row of data as { id: string; started_at: string }[]) {
    const sessionTime = new Date(row.started_at).getTime();
    const deltaMs = Math.abs(sessionTime - timestamp.getTime());
    const deltaMinutes = deltaMs / 60_000;
    if (!best || deltaMinutes < best.deltaMinutes) {
      best = { sessionId: row.id, deltaMinutes };
    }
  }

  return best;
}
