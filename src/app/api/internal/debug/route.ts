import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isRedisConfigured, redisSource } from "@/lib/redis";
import { GOAL, resolveRoadmap } from "@/lib/roadmap";
import { TESLA_SCOPES, teslaProxyBaseUrl, teslaVirtualKeyUrl } from "@/lib/tesla/constants";

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
      // Twelve is enough to see the last cron and anything that failed in it.
      // Twenty-five was mostly repeats of the same successful bulk run.
      .limit(12),
    supabase.rpc("debug_source_counts"),
    supabase
      .from("debug_logs")
      .select("level, scope, message, context, created_at")
      .order("created_at", { ascending: false })
      // 200, not 50. The panel is where a failure gets diagnosed, and a burst
      // of one noisy source used to push everything older off the end.
      .limit(200),
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
    warnings.push(`${recentErrors.length} of the last ${(runs ?? []).length} ingest runs failed.`);
  }

  const config = {
    tomtomKey: !!process.env.TOMTOM_API_KEY,
    openChargeMapKey: !!process.env.OPEN_CHARGE_MAP_API_KEY,
    redis: isRedisConfigured(),
    redisSource: redisSource(),
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    cronSecret: !!process.env.CRON_SECRET,
    ingestWebhookSecret: !!process.env.INGEST_WEBHOOK_SECRET,
    liveIntegrations: process.env.LIVE_INTEGRATIONS ?? "",
    openRouteServiceKey: !!process.env.OPENROUTESERVICE_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
  };

  // Kept out of `config` on purpose: every one of these is reported again, in
  // dependency order and with what it blocks, under tesla.steps. Listing them
  // twice made the Configuration panel the longest thing on the page while
  // saying nothing the Tesla panel did not say better.
  const teslaConfig = {
    teslaClientId: !!process.env.TESLA_CLIENT_ID,
    teslaClientSecret: !!process.env.TESLA_CLIENT_SECRET,
    teslaPublicKey: !!process.env.TESLA_PUBLIC_KEY,
    teslaTokenEncryptionKey: !!process.env.TESLA_TOKEN_ENCRYPTION_KEY,
    teslaRedirectUri: !!process.env.TESLA_REDIRECT_URI,
    teslaProxy: !!process.env.TESLA_PROXY_BASE_URL,
    teslaLive: (process.env.LIVE_INTEGRATIONS ?? "").split(",").map((s) => s.trim()).includes("tesla"),
  };

  // A plaintext proxy URL is refused at command time, which is the right place
  // to enforce it but a poor place to discover it. Say so here instead.
  let teslaProxyProblem: string | null = null;
  try {
    teslaProxyBaseUrl();
  } catch (err) {
    teslaProxyProblem = err instanceof Error ? err.message : String(err);
    warnings.push(teslaProxyProblem);
  }

  // Ordered by what actually blocks first when you try to link a car, not by
  // how the docs are written. LIVE_INTEGRATIONS is first because /api/tesla/*
  // answers 410 without it — the flow cannot even start, whatever else is set.
  const teslaSteps: { step: string; ok: boolean; blocks: string }[] = [
    { step: "LIVE_INTEGRATIONS=tesla", ok: teslaConfig.teslaLive, blocks: "every /api/tesla/* route — they answer 410 until this is set" },
    { step: "TESLA_CLIENT_ID", ok: teslaConfig.teslaClientId, blocks: "the OAuth redirect to Tesla" },
    { step: "TESLA_CLIENT_SECRET", ok: teslaConfig.teslaClientSecret, blocks: "exchanging the callback code for tokens" },
    { step: "TESLA_REDIRECT_URI", ok: teslaConfig.teslaRedirectUri, blocks: "starting OAuth at all — must equal the URI registered in the portal, /api/tesla/callback" },
    { step: "TESLA_TOKEN_ENCRYPTION_KEY", ok: teslaConfig.teslaTokenEncryptionKey, blocks: "storing refresh tokens at rest" },
    { step: "TESLA_PUBLIC_KEY", ok: teslaConfig.teslaPublicKey, blocks: "partner registration and Virtual Key pairing — register AFTER this is served" },
    { step: "TESLA_PROXY_BASE_URL", ok: teslaConfig.teslaProxy && !teslaProxyProblem, blocks: "every command on a post-2021 car — unset means nothing signs them, http means we refuse to send the access token over plaintext" },
  ];

  // Registration has no environment variable behind it, so it cannot be
  // resolved here — but leaving it out entirely is how the checklist came to
  // report every prerequisite met while linking still failed with an empty
  // vehicle list. Named explicitly, with the panel's own button as the check.
  const teslaNextStep =
    teslaSteps.find((s) => !s.ok)?.step ??
    "partner account registration — use the button below to check";

  // What the driver actually granted, per linked car. Worth surfacing because
  // Tesla's consent screen is a set of tickboxes, so a grant can come back
  // narrower than the request — and the failure is silent. Without
  // vehicle_location in particular the car answers every poll normally and
  // just never has a position, which looks like a bug in the map.
  // Active vehicles only, newest first. Without the filter this listed every
  // token row the account had ever held — including cars deactivated long ago —
  // so a grant fixed hours earlier still showed as broken, and the warning
  // below told the driver to reconnect a car that was already correct. Seven
  // rows for one visible car, four of them warning about a scope that had since
  // been granted.
  const { data: grantRows } = await supabase
    .from("tesla_tokens")
    .select("scopes, updated_at, vehicles!inner(display_name, user_id, is_active)")
    .eq("user_id", admin.userId)
    .eq("vehicles.is_active", true)
    .order("updated_at", { ascending: false });

  const teslaGrants = (grantRows ?? []).map((row) => {
    const granted: string[] = Array.isArray(row.scopes) ? row.scopes : [];
    const vehicle = row.vehicles as unknown as { display_name?: string } | null;
    return {
      vehicle: vehicle?.display_name ?? "unknown",
      granted,
      missing: TESLA_SCOPES.split(" ").filter((s) => !granted.includes(s)),
      updatedAt: row.updated_at as string | null,
    };
  });

  for (const g of teslaGrants) {
    if (g.missing.includes("vehicle_location")) {
      warnings.push(
        `${g.vehicle}: vehicle_location was not granted — the car will never report a position. Reconnect and tick every box.`,
      );
    }
  }

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
    tesla: {
      steps: teslaSteps,
      nextStep: teslaNextStep,
      grants: teslaGrants,
      // Deliberately not a checklist step: nothing on the server can observe
      // whether a car has accepted the key, so it would sit unticked forever
      // and pin nextStep to itself.
      virtualKeyUrl: teslaVirtualKeyUrl(),
    },
    // teslaConfig is merged back in here and only here. It is deliberately
    // absent from the `config` payload (the Tesla panel reports it better),
    // but the roadmap checks read teslaLive and teslaProxy — so dropping it
    // from the object flipped "Tesla linked and commands working" from done
    // back to todo, which is a lie the panel told for a day.
    roadmap: { goal: GOAL, milestones: resolveRoadmap({ ...config, ...teslaConfig }) },
    warnings,
  });
}
