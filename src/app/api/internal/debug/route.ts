import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isRedisConfigured, redisSource } from "@/lib/redis";

// Development diagnostics: charger-pipeline health, recent ingest runs, and
// which integrations are configured. Admin-only (ADMIN_EMAILS).
//
// Configuration is reported as booleans only — never a key, a prefix, or a
// length, so the payload stays safe to paste into a chat or an issue.
export const dynamic = "force-dynamic";

interface SourceCount {
  source: string;
  rows: number;
}

export async function GET() {
  const admin = await requireAdmin();
  // 404, not 403: an unauthorised caller should not learn this route exists.
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const supabase = createSupabaseAdminClient();
  const warnings: string[] = [];

  const [{ data: chargerStats }, { data: runs }, { data: sources }, { data: logs }] = await Promise.all([
    supabase.rpc("debug_charger_stats").single(),
    supabase
      .from("ingest_runs")
      .select("source, status, fetched, upserted, error, finished_at")
      .order("finished_at", { ascending: false })
      .limit(25),
    supabase.rpc("debug_source_counts"),
    supabase
      .from("debug_logs")
      .select("level, scope, message, context, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const stats = (chargerStats ?? null) as {
    total: number;
    no_country: number;
    operators: number;
    no_operator: number;
  } | null;

  if (stats) {
    if (stats.total === 0) {
      warnings.push("Charger table is empty — run an ingest.");
    } else {
      // A total absence is a broken mapping. A partial one is not: OSM carries
      // no operator or country of its own (addr:country is rarely tagged, since
      // country is implied geographically), and rows ingested before a mapping
      // fix keep their old values until their area is ingested again. Warning
      // on the partial case cried wolf permanently.
      if (stats.operators === 0) {
        warnings.push(
          "No charger has an operator at all — the source mapping is broken, not merely sparse.",
        );
      }
      if (stats.no_country === stats.total) {
        warnings.push(
          "No charger has a country at all — the source mapping is broken, not merely sparse.",
        );
      }
    }
  }

  const sourceCounts = (sources ?? []) as SourceCount[];
  const seen = new Set(sourceCounts.map((s) => s.source));
  for (const expected of ["ocm", "osm", "tomtom"]) {
    if (!seen.has(expected)) {
      warnings.push(`Source "${expected}" has contributed nothing.`);
    }
  }

  const recentErrors = (runs ?? []).filter((r) => r.status === "error");
  if (recentErrors.length > 0) {
    warnings.push(`${recentErrors.length} of the last 25 ingest runs failed.`);
  }

  const config = {
    tomtomKey: !!process.env.TOMTOM_API_KEY,
    openChargeMapKey: !!process.env.OPEN_CHARGE_MAP_API_KEY,
    redis: isRedisConfigured(),
    redisSource: redisSource(),
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    cronSecret: !!process.env.CRON_SECRET,
    ingestWebhookSecret: !!process.env.INGEST_WEBHOOK_SECRET,
    teslaProxy: !!process.env.TESLA_PROXY_BASE_URL,
    liveIntegrations: process.env.LIVE_INTEGRATIONS ?? "",
    openRouteServiceKey: !!process.env.OPENROUTESERVICE_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
  };

  if (!config.redis) {
    warnings.push(
      "Upstash Redis is not configured — rate limiting falls back to per-instance memory and every map read re-ingests.",
    );
  }
  if (!config.tomtomKey) {
    warnings.push("TOMTOM_API_KEY is unset — the TomTom connector is a silent no-op.");
  }

  // Trim the rolling window opportunistically rather than on a schedule.
  void supabase.rpc("prune_debug_logs", { p_keep: 500 });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    logs: logs ?? [],
    chargers: stats,
    sources: sourceCounts,
    recentRuns: runs ?? [],
    config,
    warnings,
  });
}
