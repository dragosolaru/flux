import type {
  BBox,
  ChargerConnector,
  RawCharger,
  SourceConnector,
} from "../types";
import { canonicalConnectorType, parsePowerKw } from "../normalize";

// TomTom Search — EV Station category (7309). Free tier ~2,500 req/day. Strong
// European coverage incl. Romania, with per-connector type + rated power. Gated
// on TOMTOM_API_KEY; without it the connector is a no-op so the pipeline still
// runs on the keyless sources.
const TOMTOM_EV_CATEGORY = "7309";
const PAGE_SIZE = 100; // TomTom max limit per call.
const MAX_PAGES = 5; // up to 500 stations per tile.

interface TomTomConnector {
  connectorType?: string | null;
  ratedPowerKW?: number | null;
}

interface TomTomResult {
  id?: string | null;
  position?: { lat?: number | null; lon?: number | null } | null;
  poi?: { name?: string | null; brands?: { name?: string | null }[] | null } | null;
  address?: {
    streetName?: string | null;
    municipality?: string | null;
    countrySubdivision?: string | null;
    countryCode?: string | null;
    postalCode?: string | null;
  } | null;
  chargingPark?: { connectors?: TomTomConnector[] | null } | null;
}

interface TomTomResponse {
  results?: TomTomResult[];
}

function bboxCenterRadiusM(bbox: BBox): { lat: number; lng: number; radiusM: number } {
  const lat = (bbox.minLat + bbox.maxLat) / 2;
  const lng = (bbox.minLng + bbox.maxLng) / 2;
  // Half-diagonal in metres so the circle covers the whole viewport rectangle.
  const dLatM = ((bbox.maxLat - bbox.minLat) / 2) * 111_320;
  const dLngM = ((bbox.maxLng - bbox.minLng) / 2) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const radiusM = Math.min(Math.hypot(dLatM, dLngM), 100_000); // TomTom caps radius.
  return { lat, lng, radiusM: Math.max(1_000, Math.round(radiusM)) };
}

export function mapTomTomResult(r: TomTomResult): RawCharger | null {
  const lat = r.position?.lat;
  const lng = r.position?.lon;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!r.id) return null;

  const operator = r.poi?.brands?.find((b) => b?.name)?.name ?? null;

  const connectors: ChargerConnector[] = (r.chargingPark?.connectors ?? [])
    .filter((c): c is TomTomConnector => c != null)
    .map((c) => ({
      type: canonicalConnectorType(c.connectorType ?? ""),
      powerKw: parsePowerKw(c.ratedPowerKW ?? null),
      count: 1,
    }));

  return {
    source: "tomtom",
    sourceRef: String(r.id),
    lat,
    lng,
    name: r.poi?.name ?? null,
    operator,
    address: {
      street: r.address?.streetName ?? null,
      city: r.address?.municipality ?? null,
      region: r.address?.countrySubdivision ?? null,
      country: r.address?.countryCode ?? null,
      postcode: r.address?.postalCode ?? null,
    },
    connectors,
    pricing: null,
  };
}

async function fetchPage(
  bbox: BBox,
  apiKey: string,
  ofs: number,
): Promise<TomTomResult[]> {
  const { lat, lng, radiusM } = bboxCenterRadiusM(bbox);
  const url = new URL(
    `https://api.tomtom.com/search/2/categorySearch/.json`,
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("categorySet", TOMTOM_EV_CATEGORY);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("ofs", String(ofs));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as TomTomResponse;
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchBounded(
  bbox: BBox,
  apiKey: string,
  maxPages: number,
): Promise<RawCharger[]> {
  try {
    const out: RawCharger[] = [];
    for (let page = 0; page < maxPages; page++) {
      const results = await fetchPage(bbox, apiKey, page * PAGE_SIZE);
      for (const r of results) {
        const mapped = mapTomTomResult(r);
        if (mapped) out.push(mapped);
      }
      if (results.length < PAGE_SIZE) break; // last page reached.
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) return [];
  return fetchBounded(bbox, apiKey, MAX_PAGES);
}

// Bulk sweep tuning. A country is walked as 1°×1° cells because TomTom caps the
// search radius at 100 km; cells run in small concurrent batches so a wide
// country finishes inside the cron's shared time budget, and pages are capped
// tighter than the tile path to stay within the free tier's daily quota.
const BULK_MAX_PAGES = 2;
const BULK_CONCURRENCY = 6;

/**
 * Country-wide TomTom sweep for the bulk importer.
 *
 * Bulk-imported countries short-circuit lazy tile ingest (see
 * repository.ensureAreaFresh), so without this pass TomTom would never
 * contribute to them at all — its data would only ever reach countries that are
 * NOT bulk imported.
 *
 * `deadline` (epoch ms) stops the sweep early so a slow country cannot consume
 * the whole cron budget; partial TomTom coverage still merges cleanly because
 * the next run re-clusters against what is already stored.
 */
export async function fetchCountryTomTom(
  bbox: BBox,
  deadline?: number,
): Promise<RawCharger[]> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) return [];

  const cells: BBox[] = [];
  for (let lat = Math.floor(bbox.minLat); lat <= Math.floor(bbox.maxLat); lat++) {
    for (let lng = Math.floor(bbox.minLng); lng <= Math.floor(bbox.maxLng); lng++) {
      cells.push({ minLat: lat, maxLat: lat + 1, minLng: lng, maxLng: lng + 1 });
    }
  }

  const out: RawCharger[] = [];
  for (let i = 0; i < cells.length; i += BULK_CONCURRENCY) {
    if (deadline != null && Date.now() >= deadline) break;
    const batch = cells.slice(i, i + BULK_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((cell) => fetchBounded(cell, apiKey, BULK_MAX_PAGES)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") out.push(...r.value);
    }
  }
  return out;
}

export const tomtomConnector: SourceConnector = {
  id: "tomtom",
  fetchTile,
};
