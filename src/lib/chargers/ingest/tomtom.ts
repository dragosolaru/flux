import type {
  BBox,
  ChargerConnector,
  RawCharger,
  SourceConnector,
} from "../types";
import { canonicalConnectorType, parsePowerKw } from "../normalize";
import { recordDebugLog } from "@/lib/debug-log";

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
  if (!res.ok) {
    // Silent [] here previously hid quota exhaustion (403) and key problems:
    // the sweep looked successful while contributing nothing.
    recordDebugLog("error", "tomtom", `categorySearch ${res.status}`);
    return [];
  }
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

export const tomtomConnector: SourceConnector = {
  id: "tomtom",
  fetchTile,
};
