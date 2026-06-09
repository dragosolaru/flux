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

/**
 * Import all chargers for a bulk country.
 * 1. Fetches official source + OCM (modifiedsince 7d) in parallel.
 * 2. Splits the country bbox into 1°×1° cells and processes each sequentially
 *    to keep memory bounded: filter → findInBBox → clusterChargers → persistClusters.
 * 3. Marks the country fresh and records an ingest_runs row.
 */
export async function bulkImportCountry(
  cc: BulkCountry,
): Promise<{ fetched: number; upserted: number; cells: number }> {
  const bbox = BULK_COUNTRIES[cc];
  const supabase = createSupabaseAdminClient();

  const [officialResult, ocmResult] = await Promise.allSettled([
    fetchOfficialSource(cc),
    fetchCountryOcm(cc.toUpperCase(), sevenDaysAgo()),
  ]);

  const raws = [
    ...(officialResult.status === "fulfilled" ? officialResult.value : []),
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

      const existing = await findInBBox({ bbox: cell, limit: 2000 });
      const clusters = clusterChargers(cellRaws, existing);
      const upserted = await persistClusters(clusters);
      totalUpserted += upserted;
    }
  }

  const shouldMarkFresh = totalUpserted > 0 || fetched === 0;
  if (shouldMarkFresh) {
    await markCountryFresh(cc);
  }

  await supabase.from("ingest_runs").insert({
    tile: `bulk:${cc}`,
    source: "bulk",
    status: fetched > 0 && totalUpserted === 0 ? "error" : "ok",
    fetched,
    upserted: totalUpserted,
    finished_at: new Date().toISOString(),
  });

  return { fetched, upserted: totalUpserted, cells };
}
