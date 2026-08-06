import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isBulkCountry } from "@/lib/chargers/countries";
import { bulkImportCountry } from "@/lib/chargers/ingest/bulk";
import { isCountryFresh } from "@/lib/chargers/repository";
import { constantTimeEqual } from "@/lib/crypto/timing";

// Full-country bulk import endpoint, invoked by the Vercel crons.
// Protected by the x-webhook-secret header; fails closed (503) if unconfigured.
export const maxDuration = 300;

// Stop starting new work well before maxDuration so the handler can still write
// its ingest_runs rows and respond instead of being killed mid-import.
const BUDGET_MS = 250_000;
// Rough floor for a country import; below this there is no point starting one.
const MIN_COUNTRY_MS = 20_000;
// Upper bound on the request's country list — the full BULK_COUNTRIES set is
// well under this, so anything larger is a malformed or abusive call.
const MAX_COUNTRIES = 24;

export async function GET(req: NextRequest) {
  // Vercel Cron attaches `Authorization: Bearer $CRON_SECRET`; manual triggers
  // may use the x-webhook-secret header. Fail closed if neither secret is set.
  const cronSecret = process.env.CRON_SECRET;
  const ingestSecret = process.env.INGEST_WEBHOOK_SECRET;
  if (!cronSecret && !ingestSecret) {
    return NextResponse.json({ message: "Warm job not configured" }, { status: 503 });
  }
  const authorized =
    (!!cronSecret && constantTimeEqual(req.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) ||
    (!!ingestSecret && constantTimeEqual(req.headers.get("x-webhook-secret") ?? "", ingestSecret));
  if (!authorized) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Accepts one country or a comma-separated list, so a single cron entry can
  // cover a whole corridor (Vercel plans cap the number of cron jobs).
  const requested = (new URL(req.url).searchParams.get("country") ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);

  if (requested.length > MAX_COUNTRIES) {
    return NextResponse.json({ message: "too-many-countries" }, { status: 400 });
  }

  // Deduplicate: without Redis every repeat would re-run a full import rather
  // than being skipped as fresh, letting one call burn the whole budget on the
  // same country.
  const countries = [...new Set(requested)].filter(isBulkCountry);
  if (countries.length === 0 || countries.length !== new Set(requested).size) {
    return NextResponse.json({ message: "unknown-country" }, { status: 400 });
  }

  // Sequential: each import is memory-heavy and the whole handler shares one
  // 300 s budget, so a parallel fan-out would risk timing out mid-country.
  //
  // Countries already fresh are skipped, and the loop stops once the remaining
  // budget can no longer fit a country. Because freshness outlives the daily
  // schedule, successive runs pick up where the previous one stopped instead of
  // always re-importing the head of the list and never reaching the tail.
  const startedAt = Date.now();
  const deadline = startedAt + BUDGET_MS;

  const results: Record<string, unknown> = {};
  for (const cc of countries) {
    if (Date.now() + MIN_COUNTRY_MS > deadline) {
      results[cc] = { skipped: "budget-exhausted" };
      continue;
    }
    if (await isCountryFresh(cc)) {
      results[cc] = { skipped: "fresh" };
      continue;
    }
    try {
      results[cc] = await bulkImportCountry(cc);
    } catch (err) {
      results[cc] = { error: err instanceof Error ? err.message : "failed" };
    }
  }

  return NextResponse.json({
    countries,
    elapsedMs: Date.now() - startedAt,
    results,
  });
}
