import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { constantTimeEqual } from "@/lib/crypto/timing";

// M7 observability: recent ingest_runs rows + an aggregate summary so operators
// can see ingestion health. Same secret-auth shape as the warm route; fails
// closed (503) if neither secret is configured, 401 if not authorized.
export const maxDuration = 15;

const RECENT_LIMIT = 50;

interface IngestRunRow {
  id: string;
  tile: string | null;
  source: string | null;
  status: string | null;
  fetched: number | null;
  upserted: number | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export async function GET(req: NextRequest) {
  // Vercel Cron attaches `Authorization: Bearer $CRON_SECRET`; manual triggers
  // may use the x-webhook-secret header. Fail closed if neither secret is set.
  const cronSecret = process.env.CRON_SECRET;
  const ingestSecret = process.env.INGEST_WEBHOOK_SECRET;
  if (!cronSecret && !ingestSecret) {
    return NextResponse.json({ message: "Ingest-stats not configured" }, { status: 503 });
  }
  const authorized =
    (!!cronSecret && constantTimeEqual(req.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) ||
    (!!ingestSecret && constantTimeEqual(req.headers.get("x-webhook-secret") ?? "", ingestSecret));
  if (!authorized) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ingest_runs")
    .select("id, tile, source, status, fetched, upserted, error, started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(RECENT_LIMIT);

  if (error) {
    console.error("[internal/ingest-stats]", error.message);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }

  const runs: IngestRunRow[] = Array.isArray(data) ? (data as IngestRunRow[]) : [];

  const summary = {
    totalRuns: runs.length,
    okRuns: runs.filter((r) => r.status === "ok").length,
    errorRuns: runs.filter((r) => r.status === "error").length,
    totalUpserted: runs.reduce((sum, r) => sum + (r.upserted ?? 0), 0),
    lastRunAt: runs[0]?.started_at ?? null,
  };

  return NextResponse.json({ summary, runs });
}
