// Bulk country-level ingest orchestrator.
// Each supported country is fetched from its official source plus OCM (incremental,
// modifiedsince 7 days ago), deduped cell-by-cell over a 1°×1° grid to keep
// memory bounded, then persisted via repository.persistClusters.
// Pricing enrichment (chargeprice) is intentionally skipped — too many rows.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BulkCountry } from "../countries";
import { BULK_COUNTRIES } from "../countries";
import { clusterChargers } from "../dedup";
import { findInBBox } from "../query";
import { persistClusters, markCountryFresh } from "../repository";
import { fetchCountryFr } from "./irve";
import { fetchCountryDe, bnetzaConfigured } from "./bnetza";
import { fetchCountryAt, austriaConfigured } from "./austria";
import { fetchCountryNl } from "./ndw";
import { fetchCountryOcm } from "./ocm";

/**
 * Which national register backs each country, and whether it is switched on.
 *
 * This exists because the importer could not previously tell the difference
 * between a source that worked, one that failed, and one that is deliberately
 * off — and it recorded all three the same way. See `recordOfficialRun`.
 */
function officialSourceFor(
  cc: BulkCountry,
): { id: string; configured: boolean } | null {
  switch (cc) {
    case "fr": return { id: "irve", configured: true };
    case "de": return { id: "bnetza", configured: bnetzaConfigured };
    case "at": return { id: "austria", configured: austriaConfigured };
    case "nl": return { id: "ndw", configured: true };
    default: return null;
  }
}

function sevenDaysAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

async function fetchOfficialSource(cc: BulkCountry) {
  switch (cc) {
    case "fr": return fetchCountryFr();
    case "de": return fetchCountryDe();
    case "at": return fetchCountryAt();
    case "nl": return fetchCountryNl();
    default: return [];
  }
}

// Countries whose official source covers the full national dataset. For the
// rest (ro/hu: no official source; at: the ArcGIS endpoint may be regional),
// OCM must be fetched in full — an incremental-only import would otherwise
// mark the country fresh while most of it was never ingested, suppressing
// lazy tile ingest for cold areas for the whole country TTL.
//
// "de" was removed after the BNetzA endpoint was found to be returning 404:
// Germany was fetching OCM incrementally on the assumption that an official
// source supplied the baseline, and that source supplied nothing — which is
// why a full German import produced 5 rows.
const FULL_OFFICIAL_SOURCE: ReadonlySet<BulkCountry> = new Set(["fr", "nl"]);

/**
 * Import all chargers for a bulk country.
 * 1. Fetches official source + OCM (modifiedsince 7d) in parallel.
 * 2. Splits the country bbox into 1°×1° cells and processes each sequentially
 *    to keep memory bounded: filter → findInBBox → clusterChargers → persistClusters.
 * 3. Marks the country fresh and records an ingest_runs row.
 */
// NOTE: TomTom is deliberately NOT swept here. Its categorySearch is a
// nearest-first radius query, so a 1°×1° cell (~68 km radius, ~8,600 km²)
// returns only the POIs closest to the cell centre — a centre-biased sample,
// not country coverage — while costing ~2 requests per cell against a ~2,500/day
// free tier and pushing a wide country past the cron's time budget. TomTom
// therefore only contributes on the lazy tile path, which bulk-fresh countries
// skip. Closing that gap needs a bulk-oriented TomTom product, not this API.
export async function bulkImportCountry(
  cc: BulkCountry,
): Promise<{ fetched: number; upserted: number; cells: number }> {
  const bbox = BULK_COUNTRIES[cc];
  const supabase = createSupabaseAdminClient();

  const ocmSince = FULL_OFFICIAL_SOURCE.has(cc) ? sevenDaysAgo() : undefined;
  const [officialResult, ocmResult] = await Promise.allSettled([
    fetchOfficialSource(cc),
    fetchCountryOcm(cc.toUpperCase(), ocmSince),
  ]);

  const official = officialSourceFor(cc);
  const officialRows =
    officialResult.status === "fulfilled" ? officialResult.value : [];

  // The national source's own outcome, recorded under its own name.
  //
  // Before this, a rejected official source was dropped by the ternary below
  // and never mentioned again: the country still got OCM rows, so the single
  // `bulk` run recorded `status: "ok"`, and nothing anywhere said that France's
  // register had stopped answering. `docs/OPERATIONS.md` §4 asks for "charger
  // rows per source, week over week" precisely because a dead connector stops
  // producing errors after the first day and starts producing a number that
  // does not move — but the number was not being recorded per source at all.
  //
  // Three states, because collapsing them is what made this invisible:
  // `disabled` for a connector switched off on purpose (recording that as an
  // error every night trains you to ignore the row), `error` for one that
  // tried and failed, `ok` for one that answered.
  if (official) {
    const status = !official.configured
      ? "disabled"
      : officialResult.status === "rejected"
        ? "error"
        : "ok";
    await supabase.from("ingest_runs").insert({
      tile: `bulk:${cc}`,
      source: official.id,
      status,
      fetched: officialRows.length,
      upserted: null,
      error:
        officialResult.status === "rejected"
          ? String(officialResult.reason).slice(0, 500)
          : null,
      finished_at: new Date().toISOString(),
    });
  }

  const raws = [
    ...officialRows,
    ...(ocmResult.status === "fulfilled" ? ocmResult.value : []),
  ];
  const fetched = raws.length;

  let totalUpserted = 0;
  let cells = 0;

  const minLngCell = Math.floor(bbox.minLng);
  const maxLngCell = Math.floor(bbox.maxLng);
  const minLatCell = Math.floor(bbox.minLat);
  const maxLatCell = Math.floor(bbox.maxLat);

  for (let latCell = minLatCell; latCell <= maxLatCell; latCell++) {
    for (let lngCell = minLngCell; lngCell <= maxLngCell; lngCell++) {
      const cell = {
        minLng: lngCell,
        maxLng: lngCell + 1,
        minLat: latCell,
        maxLat: latCell + 1,
      };

      const cellRaws = raws.filter(
        (r) =>
          r.lat >= cell.minLat &&
          r.lat < cell.maxLat &&
          r.lng >= cell.minLng &&
          r.lng < cell.maxLng,
      );
      if (cellRaws.length === 0) continue;

      cells++;

      const existing = await findInBBox({ bbox: cell, limit: 5000 });
      const clusters = clusterChargers(cellRaws, existing);
      const { upserted } = await persistClusters(clusters);
      totalUpserted += upserted;
    }
  }

  // A full-country fetch returning 0 rows is always a source failure (every
  // covered country has chargers), so freshness requires actual persistence.
  // Unchanged re-runs still qualify: the batch RPC counts hash-skipped rows.
  //
  // The second condition is the one that was missing, and it made the rot
  // self-sustaining. For a country in FULL_OFFICIAL_SOURCE, OCM is fetched
  // **incrementally** — seven days of changes — on the explicit assumption that
  // the national register supplies the baseline. If that register fails, the
  // country receives a week of OCM deltas, `totalUpserted > 0` holds, the
  // country is marked fresh, and the next run *skips it entirely* as fresh. So
  // one failure suppressed its own retry, and France or the Netherlands would
  // quietly stop being imported while every screen kept working. Germany was
  // already bitten by the same assumption — the comment on FULL_OFFICIAL_SOURCE
  // records a full German import that produced five rows.
  const officialFailed =
    official != null && official.configured && officialResult.status === "rejected";
  const shouldMarkFresh =
    totalUpserted > 0 && !(officialFailed && FULL_OFFICIAL_SOURCE.has(cc));
  if (shouldMarkFresh) {
    await markCountryFresh(cc);
  }

  await supabase.from("ingest_runs").insert({
    tile: `bulk:${cc}`,
    source: "bulk",
    status: totalUpserted === 0 ? "error" : "ok",
    fetched,
    upserted: totalUpserted,
    finished_at: new Date().toISOString(),
  });

  return { fetched, upserted: totalUpserted, cells };
}
