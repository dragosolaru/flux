// Nationaal Dataportaal Wegverkeer (NDW) — Dutch EV charging point data.
// GeoJSON, OCPI-derived properties, no auth, Open Data. Near-real-time.
//
// Rewritten against the response the live service actually returns, captured
// through the debug panel's raw source probe. The previous shape
// (`properties.evses[].connectors[]`, `properties.operator`, `properties.uid`)
// does not exist in it — every field was a guess, so even a successful fetch
// produced rows with no connector type and no power.
//
// A real feature:
//
//   { "type": "Feature", "id": "NL-TNM-7",
//     "geometry": { "type": "Point", "coordinates": [4.800828, 52.396347] },
//     "properties": {
//       "address": "Galwin 6", "last_updated": "2026-08-07T16:17:08Z",
//       "open": false, "cpo_id": "TNM", "country": "NLD",
//       "operator_name": "Shell Recharge", "owner_name": "Shell Recharge",
//       "suboperator_name": null,
//       "availabilities": [
//         { "available": 1, "connector_format": "CABLE", "connector_type": "CHADEMO",
//           "power_max": 70000.0, "power_type": "DC", "total": 2, "tariff_ids": [...] },
//         { "available": 1, "connector_format": "CABLE",
//           "connector_type": "IEC_62196_T2_COMBO", "power_max": 175000.0,
//           "power_type": "DC", "total": 2, "tariff_ids": [...] } ] } }

import type { BBox, ChargerConnector, RawCharger, SourceConnector } from "../types";
import { canonicalConnectorType } from "../normalize";
import { recordDebugLog } from "@/lib/debug-log";

const NDW_URL =
  "https://dotnl.ndw.nu/api/rest/geojson/dynamic-road-status/charge-point-data/v1/features";

// The endpoint requires a bbox — omitting it answers 400 INVALID_ARGUMENT — and
// rejects one much larger than a province, which is why the old whole-country
// fetch failed. The country is swept in windows instead.
const NL_BOUNDS = { minLng: 3.3, minLat: 50.7, maxLng: 7.3, maxLat: 53.6 };
const SWEEP_STEP_DEG = 0.5;

interface NdwAvailability {
  available?: number | null;
  connector_format?: string | null;
  connector_type?: string | null;
  power_max?: number | null;
  power_type?: string | null;
  total?: number | null;
}

interface NdwProperties {
  address?: string | null;
  last_updated?: string | null;
  open?: boolean | null;
  cpo_id?: string | null;
  country?: string | null;
  operator_name?: string | null;
  owner_name?: string | null;
  suboperator_name?: string | null;
  availabilities?: NdwAvailability[] | null;
}

interface NdwFeature {
  id?: string | null;
  geometry?: { coordinates?: [number, number] } | null;
  properties?: NdwProperties | null;
}

/** NDW reports ISO-3166 alpha-3; `chargers.country` is char(2). */
function iso2(country: string | null | undefined): string | null {
  if (!country) return null;
  const c = country.trim().toUpperCase();
  if (c.length === 2) return c;
  return c === "NLD" ? "NL" : null;
}

function toConnectors(props: NdwProperties): ChargerConnector[] {
  const rows = props.availabilities ?? [];
  if (rows.length === 0) return [];

  return rows.map((a) => ({
    type: canonicalConnectorType(a.connector_type ?? ""),
    // power_max is watts (22000.0, 175000.0). Guard the unit rather than
    // dividing blindly: a feed that ever switches to kW would otherwise turn
    // 22 kW into 0.022.
    powerKw:
      typeof a.power_max === "number" && Number.isFinite(a.power_max)
        ? a.power_max > 1000
          ? a.power_max / 1000
          : a.power_max
        : null,
    count: typeof a.total === "number" && a.total > 0 ? a.total : 1,
  }));
}

function mapFeature(f: NdwFeature): RawCharger | null {
  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const p = f.properties ?? {};
  const operator = p.operator_name ?? p.owner_name ?? null;
  const ref = f.id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`;

  return {
    source: "ndw",
    sourceRef: ref,
    lat,
    lng,
    // No title in the feed; the street is what a driver recognises on the map.
    name: p.address ?? operator,
    operator,
    address: {
      street: p.address ?? null,
      city: null,
      region: null,
      postcode: null,
      country: iso2(p.country) ?? "NL",
    },
    connectors: toConnectors(p),
    pricing: null,
    // The feed is refreshed continuously and each feature carries its own
    // last_updated, so a returned station is a live one. `available` vs `total`
    // is stall occupancy, not station health — mapping "all in use" to offline
    // would tell drivers a working site is broken.
    availability: "operational",
  };
}

function overlapsNl(bbox: BBox): boolean {
  return !(
    bbox.maxLat < NL_BOUNDS.minLat ||
    bbox.minLat > NL_BOUNDS.maxLat ||
    bbox.maxLng < NL_BOUNDS.minLng ||
    bbox.minLng > NL_BOUNDS.maxLng
  );
}

async function fetchWindow(bbox: BBox, timeoutMs: number): Promise<RawCharger[]> {
  const params = new URLSearchParams({
    bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
  });

  const res = await fetch(`${NDW_URL}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    recordDebugLog("error", "ndw", `fetch ${res.status}`, {
      bbox: params.get("bbox"),
    });
    return [];
  }

  const data: unknown = await res.json();
  const features = (data as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];

  const out: RawCharger[] = [];
  for (const f of features) {
    const mapped = mapFeature(f as NdwFeature);
    if (mapped) out.push(mapped);
  }
  return out;
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  // The connector had no geographic gate, so it was queried for every tile
  // worldwide — which is where the run of `fetch 400` while ingesting Greece
  // came from. IRVE has had this gate all along.
  if (!overlapsNl(bbox)) return [];

  try {
    return await fetchWindow(bbox, 12_000);
  } catch (err) {
    recordDebugLog("error", "ndw", "fetch failed:", {
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export const ndwConnector: SourceConnector = { id: "ndw", fetchTile };

/** Sweeps the Netherlands in windows the endpoint will accept. */
export async function fetchCountryNl(): Promise<RawCharger[]> {
  const windows: BBox[] = [];
  for (let lat = NL_BOUNDS.minLat; lat < NL_BOUNDS.maxLat; lat += SWEEP_STEP_DEG) {
    for (let lng = NL_BOUNDS.minLng; lng < NL_BOUNDS.maxLng; lng += SWEEP_STEP_DEG) {
      windows.push({
        minLat: lat,
        minLng: lng,
        maxLat: Math.min(lat + SWEEP_STEP_DEG, NL_BOUNDS.maxLat),
        maxLng: Math.min(lng + SWEEP_STEP_DEG, NL_BOUNDS.maxLng),
      });
    }
  }

  const byRef = new Map<string, RawCharger>();
  // Sequential: the windows overlap at their edges and the endpoint is a public
  // service, so this stays polite rather than firing 48 requests at once.
  for (const w of windows) {
    try {
      for (const row of await fetchWindow(w, 20_000)) byRef.set(row.sourceRef, row);
    } catch (err) {
      recordDebugLog("error", "ndw", "sweep window failed:", {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return [...byRef.values()];
}
