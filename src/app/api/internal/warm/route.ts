import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isBulkCountry } from "@/lib/chargers/countries";
import { bulkImportCountry } from "@/lib/chargers/ingest/bulk";
import { ingestArea, isCountryFresh } from "@/lib/chargers/repository";
import { constantTimeEqual } from "@/lib/crypto/timing";
import type { BBox } from "@/lib/chargers/types";

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

// Region mode: cell edge in degrees (~55 km). One ingestArea call per cell keeps
// each Overpass query and OCM page within their limits — a whole-country bbox
// would blow past OCM's 2,000-result cap and time Overpass out.
const REGION_CELL_DEG = 0.5;
// Largest region accepted in one call, in square degrees. Bigger areas should be
// requested as several calls so each stays inside the time budget.
const MAX_REGION_SQ_DEG = 60;
// Rough floor for one cell (7 sources fetched in parallel, then deduped).
const MIN_CELL_MS = 12_000;

function parseBBox(raw: string): BBox | null {
  const parts = raw.split(",").map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null;
  const [minLat, minLng, maxLat, maxLng] = parts;
  if (minLat >= maxLat || minLng >= maxLng) return null;
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
  if ((maxLat - minLat) * (maxLng - minLng) > MAX_REGION_SQ_DEG) return null;
  return { minLat, minLng, maxLat, maxLng };
}

/**
 * Ingest a region from EVERY source (OCM, Overpass, TomTom and the national
 * registries), unlike the country mode which runs OCM plus national sources
 * only. Cells already covered are re-fetched — this is the deliberate
 * "populate this area now" path, so it does not consult tile freshness.
 */
async function ingestRegion(bbox: BBox, deadline: number) {
  const cells: BBox[] = [];
  for (let lat = bbox.minLat; lat < bbox.maxLat; lat += REGION_CELL_DEG) {
    for (let lng = bbox.minLng; lng < bbox.maxLng; lng += REGION_CELL_DEG) {
      cells.push({
        minLat: lat,
        minLng: lng,
        maxLat: Math.min(lat + REGION_CELL_DEG, bbox.maxLat),
        maxLng: Math.min(lng + REGION_CELL_DEG, bbox.maxLng),
      });
    }
  }

  let upserted = 0;
  let done = 0;
  for (const cell of cells) {
    if (Date.now() + MIN_CELL_MS > deadline) break;
    try {
      const res = await ingestArea(cell);
      upserted += res.upserted;
    } catch (err) {
      console.error("[warm] cell failed:", err instanceof Error ? err.message : err);
    }
    done++;
  }

  return { cells: cells.length, cellsDone: done, upserted, complete: done === cells.length };
}

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

  const params = new URL(req.url).searchParams;

  // Region mode — every source, on demand. Country mode below is the cron path.
  const bboxParam = params.get("bbox");
  if (bboxParam) {
    const bbox = parseBBox(bboxParam);
    if (!bbox) {
      return NextResponse.json(
        { message: "bad-bbox", expected: "minLat,minLng,maxLat,maxLng", maxSqDeg: MAX_REGION_SQ_DEG },
        { status: 400 },
      );
    }
    const startedAt = Date.now();
    const result = await ingestRegion(bbox, startedAt + BUDGET_MS);
    return NextResponse.json({ bbox, elapsedMs: Date.now() - startedAt, ...result });
  }

  // Accepts one country or a comma-separated list, so a single cron entry can
  // cover a whole corridor (Vercel plans cap the number of cron jobs).
  const requested = (params.get("country") ?? "")
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
