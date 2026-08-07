// Nationaal Dataportaal Wegverkeer (NDW) — Dutch EV charging point data.
// GeoJSON API with bounding-box, OCPI-based properties, no auth, Open Data.
// Endpoint: DOT-NL platform (dotnl.ndw.nu), updated in near-real-time.

import type { BBox, ChargerConnector, RawCharger, SourceConnector } from "../types";
import { canonicalConnectorType, parsePowerKw } from "../normalize";

const NDW_URL =
  "https://dotnl.ndw.nu/api/rest/geojson/dynamic-road-status/charge-point-data/v1/features";

interface NdwConnector {
  standard?: string | null;
  format?: string | null;
  power_type?: string | null;
  max_electric_power?: number | null;
  // Sometimes power is nested differently
  amperage?: number | null;
  voltage?: number | null;
}

interface NdwEvse {
  connectors?: NdwConnector[];
}

interface NdwProperties {
  uid?: string | null;
  id?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  operator?: string | { name?: string } | null;
  evses?: NdwEvse[];
  // Flat connector list (alternative schema)
  connectors?: NdwConnector[];
  max_electric_power?: number | null;
}

interface NdwFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: NdwProperties;
}

function operatorName(op: NdwProperties["operator"]): string | null {
  if (!op) return null;
  if (typeof op === "string") return op || null;
  return op.name ?? null;
}

function extractConnectors(props: NdwProperties): ChargerConnector[] {
  // Prefer nested evses → connectors
  const evses = props.evses ?? [];
  const rawConns: NdwConnector[] = evses.flatMap((e) => e.connectors ?? []);
  // Fall back to top-level connectors
  const all = rawConns.length > 0 ? rawConns : (props.connectors ?? []);

  if (all.length === 0) {
    const power = parsePowerKw(props.max_electric_power ?? null);
    return [{ type: "other", powerKw: power, count: 1 }];
  }

  return all.map((c) => {
    const typeInput = c.standard ?? c.format ?? "";
    // OCPI power is in watts when > 1000, kW otherwise
    const rawPower = c.max_electric_power ?? null;
    const power =
      typeof rawPower === "number" && rawPower > 1000 ? rawPower / 1000 : parsePowerKw(rawPower);
    return {
      type: canonicalConnectorType(typeInput),
      powerKw: power,
      count: 1,
    };
  });
}

function mapFeature(f: NdwFeature): RawCharger | null {
  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords as [number, number];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const p = f.properties ?? {};
  const ref = p.uid ?? p.id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const op = operatorName(p.operator);

  return {
    source: "ndw",
    sourceRef: ref,
    lat,
    lng,
    name: p.name ?? op,
    operator: op,
    address: {
      street: p.address ?? null,
      city: p.city ?? null,
      region: null,
      postcode: p.postal_code ?? null,
      country: p.country ?? "NL",
    },
    connectors: extractConnectors(p),
    pricing: null,
  };
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  try {
    const params = new URLSearchParams({
      bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
    });

    const res = await fetch(`${NDW_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.error(`[ndw] fetch ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { features?: NdwFeature[] };
    const features = data.features;
    if (!Array.isArray(features)) return [];

    const out: RawCharger[] = [];
    for (const f of features) {
      const mapped = mapFeature(f);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (err) {
    console.error(`[ndw] fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export const ndwConnector: SourceConnector = { id: "ndw", fetchTile };

const NL_BBOX = { minLng: 3.3, minLat: 50.7, maxLng: 7.3, maxLat: 53.6 };

/**
 * Full-country fetch: queries the NDW endpoint with the whole NL bounding box.
 * The current tile fetch is already bbox-based; this just drops the tile restriction.
 */
export async function fetchCountryNl(): Promise<RawCharger[]> {
  try {
    const params = new URLSearchParams({
      bbox: `${NL_BBOX.minLng},${NL_BBOX.minLat},${NL_BBOX.maxLng},${NL_BBOX.maxLat}`,
    });

    const res = await fetch(`${NDW_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.error(`[ndw] fetch ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { features?: NdwFeature[] };
    const features = data.features;
    if (!Array.isArray(features)) return [];

    const out: RawCharger[] = [];
    for (const f of features) {
      const mapped = mapFeature(f);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (err) {
    console.error(`[ndw] fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}
