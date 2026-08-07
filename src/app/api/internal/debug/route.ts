import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isRedisConfigured, redisSource } from "@/lib/redis";
import { GOAL, resolveRoadmap } from "@/lib/roadmap";

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
    // Everything the live Tesla path needs, in the order it is needed. Reported
    // together because a half-configured integration fails at the point of use
    // — a command returning 412 — rather than at startup.
    teslaClientId: !!process.env.TESLA_CLIENT_ID,
    teslaClientSecret: !!process.env.TESLA_CLIENT_SECRET,
    teslaPublicKey: !!process.env.TESLA_PUBLIC_KEY,
    teslaTokenEncryptionKey: !!process.env.TESLA_TOKEN_ENCRYPTION_KEY,
    teslaRedirectUri: !!process.env.TESLA_REDIRECT_URI,
    teslaLive: (process.env.LIVE_INTEGRATIONS ?? "").split(",").map((s) => s.trim()).includes("tesla"),
  };

  // Ordered by what actually blocks first when you try to link a car, not by
  // how the docs are written. LIVE_INTEGRATIONS is first because /api/tesla/*
  // answers 410 without it — the flow cannot even start, whatever else is set.
  const teslaSteps: { step: string; ok: boolean; blocks: string }[] = [
    { step: "LIVE_INTEGRATIONS=tesla", ok: config.teslaLive, blocks: "every /api/tesla/* route — they answer 410 until this is set" },
    { step: "TESLA_CLIENT_ID", ok: config.teslaClientId, blocks: "the OAuth redirect to Tesla" },
    { step: "TESLA_CLIENT_SECRET", ok: config.teslaClientSecret, blocks: "exchanging the callback code for tokens" },
    { step: "TESLA_REDIRECT_URI", ok: config.teslaRedirectUri, blocks: "starting OAuth at all — must equal the URI registered in the portal, /api/tesla/callback" },
    { step: "TESLA_TOKEN_ENCRYPTION_KEY", ok: config.teslaTokenEncryptionKey, blocks: "storing refresh tokens at rest" },
    { step: "TESLA_PUBLIC_KEY", ok: config.teslaPublicKey, blocks: "partner registration and Virtual Key pairing — register AFTER this is served" },
    { step: "TESLA_PROXY_BASE_URL", ok: config.teslaProxy, blocks: "every command on a post-2021 car (412 VCP_REQUIRED)" },
  ];

  // Registration has no environment variable behind it, so it cannot be
  // resolved here — but leaving it out entirely is how the checklist came to
  // report every prerequisite met while linking still failed with an empty
  // vehicle list. Named explicitly, with the panel's own button as the check.
  const teslaNextStep =
    teslaSteps.find((s) => !s.ok)?.step ??
    "partner account registration — use the button below to check";

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
    tesla: { steps: teslaSteps, nextStep: teslaNextStep },
    roadmap: { goal: GOAL, milestones: resolveRoadmap(config) },
    warnings,
  });
}
