// Austrian e-charging infrastructure open data (data.gv.at).
// ArcGIS REST API, no auth required. License: CC BY 4.0.
// Same protocol as BNetzA — only the URL and field names differ.
// Covers the DE→AT→HU→RO corridor gaps that BNetzA leaves at the German border.

import type { BBox, ChargerConnector, RawCharger, SourceConnector } from "../types";
import { canonicalConnectorType, parsePowerKw } from "../normalize";

const AUSTRIA_URL =
  "https://gis.bgld.gv.at/arcgis/rest/services/Oeffentlich/E_Tankstellen/MapServer/0/query";

// Burgenland (easternmost AT state) proxy — data.gv.at aggregates across states.
// If this specific endpoint is unavailable, the connector silently returns []
// and the tile stays uncached — the existing fallback (OCM+OSM) still covers AT.
// A future iteration can add the other AT state ArcGIS endpoints.

interface AustriaAttributes {
  OBJECTID?: number | null;
  BETREIBER?: string | null;
  STRASSE?: string | null;
  HAUSNUMMER?: string | null;
  PLZ?: string | null;
  ORT?: string | null;
  BUNDESLAND?: string | null;
  BREITENGRAD?: number | null;
  LAENGENGRAD?: number | null;
  LADELEISTUNG?: string | number | null;
  STECKERTYP?: string | null;
  ANZAHL_LADEPUNKTE?: number | null;
  [key: string]: unknown;
}

interface AustriaFeature {
  attributes?: AustriaAttributes;
  geometry?: { x?: number; y?: number };
}

function buildConnectors(
  steckertyp: string | null | undefined,
  powerKw: number | null,
  total: number,
): ChargerConnector[] {
  const types = (steckertyp ?? "")
    .split(/[,;\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (types.length === 0) {
    return [{ type: "other", powerKw, count: Math.max(total, 1) }];
  }
  const perType = Math.max(1, Math.round(total / types.length));
  return types.map((t) => ({
    type: canonicalConnectorType(t),
    powerKw,
    count: perType,
  }));
}

function mapFeature(f: AustriaFeature): RawCharger | null {
  const a = f.attributes ?? {};
  const lat = f.geometry?.y ?? (typeof a.BREITENGRAD === "number" ? a.BREITENGRAD : null);
  const lng = f.geometry?.x ?? (typeof a.LAENGENGRAD === "number" ? a.LAENGENGRAD : null);
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Sanity check: AT bounding box (roughly)
  if (lat < 46.3 || lat > 49.1 || lng < 9.5 || lng > 17.2) return null;

  const powerKw = parsePowerKw(a.LADELEISTUNG ?? null);
  const count = typeof a.ANZAHL_LADEPUNKTE === "number" ? a.ANZAHL_LADEPUNKTE : 1;
  const connectors = buildConnectors(a.STECKERTYP ?? null, powerKw, count);

  return {
    source: "austria",
    sourceRef: String(a.OBJECTID ?? `${lat.toFixed(5)},${lng.toFixed(5)}`),
    lat,
    lng,
    name: a.BETREIBER ?? null,
    operator: a.BETREIBER ?? null,
    address: {
      street: [a.STRASSE, a.HAUSNUMMER].filter(Boolean).join(" ") || null,
      city: a.ORT ?? null,
      region: a.BUNDESLAND ?? null,
      postcode: a.PLZ ? String(a.PLZ) : null,
      country: "AT",
    },
    connectors,
    pricing: null,
  };
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  // Only query when the bbox overlaps Austria (rough bounds check saves API calls)
  if (bbox.maxLat < 46.3 || bbox.minLat > 49.1 || bbox.maxLng < 9.5 || bbox.minLng > 17.2) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      geometry: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      f: "json",
      resultRecordCount: "2000",
    });

    const res = await fetch(`${AUSTRIA_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { features?: AustriaFeature[] };
    if (!Array.isArray(data.features)) return [];

    const out: RawCharger[] = [];
    for (const f of data.features) {
      const mapped = mapFeature(f);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch {
    return [];
  }
}

export const austriaConnector: SourceConnector = { id: "austria", fetchTile };
