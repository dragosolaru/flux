import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Session-authed, user-facing charger index health: how many stations are
// indexed and when the data was last refreshed. Charger tables are shared
// reference data (read via the admin client); access is gated by the session.
export const maxDuration = 15;

interface LastRunRow {
  status: string | null;
  finished_at: string | null;
  started_at: string | null;
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!(await checkRateLimit(session.user.id, "chargers", 120))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();

  const [{ count: totalChargers }, { count: fastChargers }, lastRun] = await Promise.all([
    supabase.from("chargers").select("*", { count: "exact", head: true }),
    supabase
      .from("chargers")
      .select("*", { count: "exact", head: true })
      .gte("max_power_kw", 50),
    supabase
      .from("ingest_runs")
      .select("status, finished_at, started_at")
      .eq("status", "ok")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const run = (lastRun.data as LastRunRow | null) ?? null;

  return NextResponse.json({
    totalChargers: totalChargers ?? 0,
    fastChargers: fastChargers ?? 0,
    lastRefresh: run?.finished_at ?? run?.started_at ?? null,
  });
}
