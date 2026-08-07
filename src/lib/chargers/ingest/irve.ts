// French IRVE (Infrastructures de Recharge de Véhicules Électriques) open data.
// Source: data.gouv.fr — consolidated daily CSV/GeoJSON, legally mandated under AFIR.
// License: Open License v2.0 (≈ CC BY). ~90k+ charge points, operators required to report.
// No API key required. Bbox-gated to FR bounds to avoid fetching on non-French tiles.

import type { BBox, ChargerConnector, RawCharger, SourceConnector } from "../types";
import { canonicalConnectorType } from "../normalize";

// Consolidated GeoJSON published daily by data.gouv.fr.
// Using the stable resource URL from the IRVE national dataset.
const IRVE_URL =
  "https://www.data.gouv.fr/fr/datasets/r/eb76d20a-8501-400e-b336-d85724de5435";

// France bounding box (metropolitan)
const FR_MIN_LAT = 41.3;
const FR_MAX_LAT = 51.2;
const FR_MIN_LNG = -5.2;
const FR_MAX_LNG = 9.6;

// Module-level cache: GeoJSON parsed once per cold-start, refreshed after 6 hours.
let cachedFeatures: IrveFeature[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface IrveProperties {
  id_pdc_itinerance?: string | null;
  nom_operateur?: string | null;
  nom_enseigne?: string | null;
  adresse_station?: string | null;
  code_postal?: string | null;
  commune?: string | null;
  type_prise?: string | null;      // e.g. "T2,COMBO_CCS"
  puissance_nominale?: number | string | null;
  nbre_pdc?: number | string | null;
  [key: string]: unknown;
}

interface IrveFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] } | null;
  properties: IrveProperties;
}

function parseIrveConnectors(
  typePrise: string | null | undefined,
  powerKw: number | null,
  count: number,
): ChargerConnector[] {
  const types = (typePrise ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (types.length === 0) {
    return [{ type: "other", powerKw, count: Math.max(count, 1) }];
  }
  const perType = Math.max(1, Math.round(count / types.length));
  return types.map((t) => ({
    type: canonicalConnectorType(t),
    powerKw,
    count: perType,
  }));
}

function mapFeature(f: IrveFeature): RawCharger | null {
  if (!f.geometry || f.geometry.type !== "Point") return null;
  const [lng, lat] = f.geometry.coordinates;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const p = f.properties;
  const rawPower = p.puissance_nominale;
  const powerKw =
    typeof rawPower === "number"
      ? rawPower
      : rawPower
        ? parseFloat(String(rawPower)) || null
        : null;
  const rawCount = p.nbre_pdc;
  const count =
    typeof rawCount === "number"
      ? rawCount
      : rawCount
        ? parseInt(String(rawCount), 10) || 1
        : 1;
  const connectors = parseIrveConnectors(p.type_prise ?? null, powerKw, count);
  const operator = p.nom_operateur ?? p.nom_enseigne ?? null;

  return {
    source: "irve",
    sourceRef: p.id_pdc_itinerance ?? `${lat.toFixed(5)},${lng.toFixed(5)}`,
    lat,
    lng,
    name: operator,
    operator,
    address: {
      street: p.adresse_station ?? null,
      city: p.commune ?? null,
      region: null,
      postcode: p.code_postal ? String(p.code_postal) : null,
      country: "FR",
    },
    connectors,
    pricing: null,
  };
}

async function loadFeatures(): Promise<IrveFeature[]> {
  const now = Date.now();
  if (cachedFeatures && now - cacheTimestamp < CACHE_TTL_MS) return cachedFeatures;

  const res = await fetch(IRVE_URL, {
    headers: { Accept: "application/geo+json,application/json" },
    signal: AbortSignal.timeout(30000), // large file, allow 30s
  });
  if (!res.ok) throw new Error(`IRVE ${res.status}`);

  const data = (await res.json()) as { features?: IrveFeature[] };
  const features = data.features ?? [];
  cachedFeatures = features;
  cacheTimestamp = now;
  return features;
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  // Only query when the bbox overlaps metropolitan France
  if (
    bbox.maxLat < FR_MIN_LAT ||
    bbox.minLat > FR_MAX_LAT ||
    bbox.maxLng < FR_MIN_LNG ||
    bbox.minLng > FR_MAX_LNG
  ) {
    return [];
  }

  try {
    const features = await loadFeatures();
    const out: RawCharger[] = [];
    for (const f of features) {
      if (!f.geometry) continue;
      const [lng, lat] = f.geometry.coordinates;
      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        lat < bbox.minLat ||
        lat > bbox.maxLat ||
        lng < bbox.minLng ||
        lng > bbox.maxLng
      ) {
        continue;
      }
      const mapped = mapFeature(f);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (err) {
    console.error(`[irve] fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export const irveConnector: SourceConnector = { id: "irve", fetchTile };

/** Full-country fetch: loads the complete IRVE GeoJSON without any bbox filter. */
export async function fetchCountryFr(): Promise<RawCharger[]> {
  try {
    const features = await loadFeatures();
    const out: RawCharger[] = [];
    for (const f of features) {
      const mapped = mapFeature(f);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (err) {
    console.error(`[irve] fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}
