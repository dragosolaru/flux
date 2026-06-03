import type { BBox, RawCharger } from "../types";
import { ocmConnector } from "./ocm";
import { overpassConnector } from "./overpass";
import { bnetzaConnector } from "./bnetza";
import { ndwConnector } from "./ndw";
import { enrichPricing } from "./chargeprice";

export { ocmConnector } from "./ocm";
export { overpassConnector } from "./overpass";
export { bnetzaConnector } from "./bnetza";
export { ndwConnector } from "./ndw";
export { enrichPricing } from "./chargeprice";

/**
 * Fetch every source for a bbox in parallel, concat the successful results,
 * then run pricing enrichment. Dedup/merge is a separate module — not here.
 * Sources: OCM (global), Overpass/OSM (global), BNetzA (DE), NDW (NL).
 * Each connector is fault-tolerant — failures return [] and don't block others.
 */
export async function fetchAllSources(bbox: BBox): Promise<RawCharger[]> {
  const settled = await Promise.allSettled([
    ocmConnector.fetchTile(bbox),
    overpassConnector.fetchTile(bbox),
    bnetzaConnector.fetchTile(bbox),
    ndwConnector.fetchTile(bbox),
  ]);

  const combined: RawCharger[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") combined.push(...result.value);
  }

  return enrichPricing(combined);
}
