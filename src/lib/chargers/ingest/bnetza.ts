// German Federal Network Agency (Bundesnetzagentur) Ladesäulenregister.
// ArcGIS REST API, no auth required, updated daily.
// License: Datenlizenz Deutschland Namensnennung 2.0 (≈ CC BY).

import type { BBox, ChargerConnector, RawCharger, SourceConnector } from "../types";
import { canonicalConnectorType, parsePowerKw } from "../normalize";

const BNETZA_URL = "https://ladestationen.api.bund.dev/api/query";

interface BNetzAAttributes {
  ObjectID?: number | null;
  Betreiber?: string | null;
  Strasse?: string | null;
  Hausnummer?: string | null;
  Postleitzahl?: string | null;
  Ort?: string | null;
  Bundesland?: string | null;
  Breitengrad?: number | null;
  Laengengrad?: number | null;
  Nennleistung_Ladepunkt?: string | number | null;
  Steckdosentyp?: string | null;
  Anzahl_Ladepunkte?: number | null;
  [key: string]: unknown;
}

interface BNetzAFeature {
  attributes?: BNetzAAttributes;
  geometry?: { x?: number; y?: number };
}

function buildBNetzAConnectors(
  steckdosen: string | null | undefined,
  power: number | null,
  total: number,
): ChargerConnector[] {
  const types = (steckdosen ?? "")
    .split(/[,;\/]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (types.length === 0) {
    return [{ type: "other", powerKw: power, count: Math.max(total, 1) }];
  }

  const perType = Math.max(1, Math.round(total / types.length));
  return types.map((t) => ({
    type: canonicalConnectorType(t),
    powerKw: power,
    count: perType,
  }));
}

function mapFeature(f: BNetzAFeature): RawCharger | null {
  const a = f.attributes ?? {};
  const lat = f.geometry?.y ?? (typeof a.Breitengrad === "number" ? a.Breitengrad : null);
  const lng = f.geometry?.x ?? (typeof a.Laengengrad === "number" ? a.Laengengrad : null);
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const power = parsePowerKw(a.Nennleistung_Ladepunkt ?? null);
  const count = typeof a.Anzahl_Ladepunkte === "number" ? a.Anzahl_Ladepunkte : 1;
  const connectors = buildBNetzAConnectors(a.Steckdosentyp ?? null, power, count);

  return {
    source: "bnetza",
    sourceRef: String(a.ObjectID ?? `${lat.toFixed(5)},${lng.toFixed(5)}`),
    lat,
    lng,
    name: a.Betreiber ?? null,
    operator: a.Betreiber ?? null,
    address: {
      street: [a.Strasse, a.Hausnummer].filter(Boolean).join(" ") || null,
      city: a.Ort ?? null,
      region: a.Bundesland ?? null,
      postcode: a.Postleitzahl ? String(a.Postleitzahl) : null,
      country: "DE",
    },
    connectors,
    pricing: null,
  };
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  try {
    const params = new URLSearchParams({
      geometry: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      f: "json",
      resultRecordCount: "2000",
    });

    const res = await fetch(`${BNETZA_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { features?: BNetzAFeature[] };
    const features = data.features;
    if (!Array.isArray(features)) return [];

    const out: RawCharger[] = [];
    for (const f of features) {
      const mapped = mapFeature(f);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch {
    return [];
  }
}

export const bnetzaConnector: SourceConnector = { id: "bnetza", fetchTile };
