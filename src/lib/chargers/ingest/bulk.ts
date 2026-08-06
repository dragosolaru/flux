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
import { fetchCountryDe } from "./bnetza";
import { fetchCountryAt } from "./austria";
import { fetchCountryNl } from "./ndw";
import { fetchCountryOcm } from "./ocm";
import { fetchCountryTomTom } from "./tomtom";

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
const FULL_OFFICIAL_SOURCE: ReadonlySet<BulkCountry> = new Set(["fr", "de", "nl"]);

/**
 * Import all chargers for a bulk country.
 * 1. Fetches official source + OCM (modifiedsince 7d) in parallel.
 * 2. Splits the country bbox into 1°×1° cells and processes each sequentially
 *    to keep memory bounded: filter → findInBBox → clusterChargers → persistClusters.
 * 3. Marks the country fresh and records an ingest_runs row.
 */
export async function bulkImportCountry(
  cc: BulkCountry,
  deadline?: number,
): Promise<{ fetched: number; upserted: number; cells: number }> {
  const bbox = BULK_COUNTRIES[cc];
  const supabase = createSupabaseAdminClient();

  const ocmSince = FULL_OFFICIAL_SOURCE.has(cc) ? sevenDaysAgo() : undefined;
  const [officialResult, ocmResult, tomtomResult] = await Promise.allSettled([
    fetchOfficialSource(cc),
    fetchCountryOcm(cc.toUpperCase(), ocmSince),
    // Bulk countries short-circuit lazy tile ingest, so TomTom has to be swept
    // here or it never reaches them.
    fetchCountryTomTom(bbox, deadline),
  ]);

  const raws = [
    ...(officialResult.status === "fulfilled" ? officialResult.value : []),
    ...(ocmResult.status === "fulfilled" ? ocmResult.value : []),
    ...(tomtomResult.status === "fulfilled" ? tomtomResult.value : []),
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
      const upserted = await persistClusters(clusters);
      totalUpserted += upserted;
    }
  }

  // A full-country fetch returning 0 rows is always a source failure (every
  // covered country has chargers), so freshness requires actual persistence.
  // Unchanged re-runs still qualify: the batch RPC counts hash-skipped rows.
  const shouldMarkFresh = totalUpserted > 0;
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
