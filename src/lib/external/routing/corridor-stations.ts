import { ensureAreaFresh } from "@/lib/chargers/repository";
import { findInBBox } from "@/lib/chargers/query";
import type { Charger, ConnectorType } from "@/lib/chargers/types";
import type { ChargingStation, NetworkId, PlugType } from "@/lib/external/charging-networks/types";
import type { RoutePoint } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OCM_URL = "https://api.openchargemap.io/v3/poi/";
const BBOX_PAD_DEG = 0.15;
const FAST_KW_THRESHOLD = 40;
const MAX_STATIONS = 400;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

function isOverpassResponse(value: unknown): value is OverpassResponse {
  if (typeof value !== "object" || value === null) return false;
  const elements = (value as { elements?: unknown }).elements;
  return elements === undefined || Array.isArray(elements);
}

interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

function computeBBox(
  polyline: [number, number][] | null,
  origin: RoutePoint,
  destination: RoutePoint,
): BBox {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;

  const points: { lat: number; lng: number }[] = [];
  if (polyline && polyline.length > 0) {
    for (const [lng, lat] of polyline) points.push({ lat, lng });
  } else {
    points.push(origin, destination);
  }

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  return {
    minLat: minLat - BBOX_PAD_DEG,
    minLng: minLng - BBOX_PAD_DEG,
    maxLat: maxLat + BBOX_PAD_DEG,
    maxLng: maxLng + BBOX_PAD_DEG,
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePower(tags: Record<string, string>): number {
  const candidates = [
    tags["maxpower"],
    tags["socket:ccs:output"],
    tags["socket:type2:output"],
    tags["charge"],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const match = raw.match(/([\d.]+)\s*(kw|w)?/i);
    if (!match) continue;
    const num = parseFloat(match[1]!);
    if (!Number.isFinite(num) || num <= 0) continue;
    const unit = match[2]?.toLowerCase();
    if (unit === "w" || (unit === undefined && num > 1000)) {
      return Math.round(num / 1000);
    }
    return Math.round(num);
  }
  return 0;
}

function parsePlugTypes(tags: Record<string, string>): PlugType[] {
  const plugs: PlugType[] = [];
  const socket = tags["socket"] ?? "";
  const hasCcs =
    tags["socket:ccs"] != null ||
    tags["socket:ccs:output"] != null ||
    /ccs/i.test(socket);
  const hasType2 =
    tags["socket:type2"] != null ||
    tags["socket:type2:output"] != null ||
    tags["socket:type2_combo"] != null ||
    /type2/i.test(socket);
  const hasChademo =
    tags["socket:chademo"] != null || /chademo/i.test(socket);

  if (hasCcs) plugs.push("CCS");
  if (hasChademo) plugs.push("CHAdeMO");
  if (hasType2) plugs.push("Type2");
  return plugs.length > 0 ? plugs : ["CCS"];
}

function mapElement(el: OverpassElement): ChargingStation | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;

  const tags = el.tags ?? {};
  const operator = tags["operator"] ?? tags["network"] ?? null;
  const networkId: NetworkId = operator ? (slug(operator) as NetworkId) : "other";

  const capacity = parseInt(tags["capacity"] ?? "", 10);
  const totalStalls = Number.isFinite(capacity) && capacity > 0 ? capacity : 1;

  return {
    id: `osm-${el.type}-${el.id}`,
    networkId,
    name: tags["name"] ?? operator ?? "Charging Station",
    lat,
    lng,
    maxKw: parsePower(tags),
    totalStalls,
    plugTypes: parsePlugTypes(tags),
    priceEurKwh: null,
    addressCity: tags["addr:city"] ?? tags["addr:suburb"] ?? "",
    addressCountry: tags["addr:country"] ?? "RO",
  };
}

function preferFast(stations: ChargingStation[]): ChargingStation[] {
  const fast = stations.filter((s) => s.maxKw >= FAST_KW_THRESHOLD);
  const selected = fast.length >= 3 ? fast : stations;
  return selected.slice(0, MAX_STATIONS);
}

const CONNECTOR_TO_PLUG: Record<ConnectorType, PlugType | null> = {
  ccs2: "CCS",
  ccs1: "CCS",
  chademo: "CHAdeMO",
  type2: "Type2",
  type1: "Type2",
  tesla: "Tesla",
  schuko: null,
  other: null,
};

function chargerToPlugTypes(charger: Charger): PlugType[] {
  const plugs = new Set<PlugType>();
  for (const c of charger.connectors) {
    const plug = CONNECTOR_TO_PLUG[c.type];
    if (plug) plugs.add(plug);
  }
  return plugs.size > 0 ? [...plugs] : ["CCS"];
}

function chargerToStation(charger: Charger): ChargingStation {
  const operator = charger.operator ?? charger.operatorId;
  const networkId: NetworkId = operator ? (slug(operator) as NetworkId) : "other";
  return {
    id: charger.id,
    networkId,
    name: charger.name ?? charger.operator ?? "Charging Station",
    lat: charger.lat,
    lng: charger.lng,
    maxKw: charger.maxPowerKw ?? 0,
    totalStalls: charger.connectors.reduce((sum, c) => sum + c.count, 0) || 1,
    plugTypes: chargerToPlugTypes(charger),
    priceEurKwh: charger.pricing?.perKwh ?? null,
    addressCity: charger.address.city ?? "",
    addressCountry: charger.address.country ?? "RO",
  };
}

/**
 * Fetch real fast-charging stations within a bounding box around the route
 * corridor. Reads from the PostGIS charger platform (ensuring the area is fresh
 * first); on any error or empty result falls back to the live Overpass query so
 * trips still work before the charger migrations are applied.
 */
// Cap cold-area ingestion so a long, un-ingested corridor degrades to the fast
// Overpass fallback instead of blocking the trip-plan request while every tile
// is fetched + upserted.
const ENSURE_FRESH_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("ensureAreaFresh timeout")), ms),
    ),
  ]);
}

export async function fetchCorridorStations(
  polyline: [number, number][] | null,
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<ChargingStation[]> {
  const bbox = computeBBox(polyline, origin, destination);
  try {
    await withTimeout(ensureAreaFresh(bbox), ENSURE_FRESH_TIMEOUT_MS);
    // ensureAreaFresh succeeded → trust the PostGIS result, even when empty
    // (a genuinely empty area shouldn't trigger a redundant Overpass round-trip).
    const chargers = await findInBBox({ bbox, limit: 500 });
    return preferFast(chargers.map(chargerToStation));
  } catch {
    // Cold-area timeout, RPC missing (pre-migration), or query error → fall back
    // to a live API. Open Charge Map is the primary fallback (global, reliable,
    // well-maintained); Overpass is the secondary in case OCM is unreachable.
    const ocm = await fetchCorridorStationsOCM(bbox);
    if (ocm.length > 0) return ocm;
    return fetchCorridorStationsOverpass(polyline, origin, destination);
  }
}

interface OcmConnection {
  PowerKW?: number | null;
}

interface OcmPoi {
  ID: number;
  AddressInfo?: {
    Title?: string | null;
    Latitude?: number | null;
    Longitude?: number | null;
    Town?: string | null;
  } | null;
  OperatorInfo?: { Title?: string | null } | null;
  Connections?: OcmConnection[] | null;
  StatusType?: { IsOperational?: boolean | null } | null;
  DateLastVerified?: string | null;
  DateLastStatusUpdate?: string | null;
}

function ocmToStation(poi: OcmPoi): ChargingStation | null {
  const info = poi.AddressInfo;
  if (!info || info.Latitude == null || info.Longitude == null) return null;

  const maxKw = (poi.Connections ?? []).reduce(
    (max, c) => (c.PowerKW != null && c.PowerKW > max ? c.PowerKW : max),
    0,
  );
  const operator = poi.OperatorInfo?.Title ?? null;
  const networkId: NetworkId = operator ? (slug(operator) as NetworkId) : "other";

  const lastVerifiedAt = poi.DateLastVerified ?? poi.DateLastStatusUpdate ?? undefined;
  const isOperational =
    poi.StatusType?.IsOperational == null ? undefined : poi.StatusType.IsOperational;

  return {
    id: `ocm-${poi.ID}`,
    networkId,
    name: info.Title ?? operator ?? "Charging Station",
    lat: info.Latitude,
    lng: info.Longitude,
    maxKw: Math.round(maxKw),
    totalStalls: (poi.Connections ?? []).length || 1,
    // Plug type doesn't affect routing feasibility (planner filters on power +
    // distance only); default to CCS to keep the mapping simple.
    plugTypes: ["CCS"],
    priceEurKwh: null,
    addressCity: info.Town ?? "",
    addressCountry: "",
    lastVerifiedAt,
    isOperational,
  };
}

/**
 * Fetch corridor stations from Open Charge Map — a dedicated, well-maintained
 * global EV charging registry. More reliable from serverless than Overpass.
 * Returns [] on any error so the caller can fall back further.
 */
export async function fetchCorridorStationsOCM(bbox: BBox): Promise<ChargingStation[]> {
  try {
    const params = new URLSearchParams({
      output: "json",
      // OCM boundingbox: (lat,lng),(lat,lng) — top-left, bottom-right.
      boundingbox: `(${bbox.maxLat},${bbox.minLng}),(${bbox.minLat},${bbox.maxLng})`,
      maxresults: "500",
      compact: "true",
      verbose: "false",
    });
    const key = process.env.OPEN_CHARGE_MAP_API_KEY;
    if (key) params.set("key", key);

    const res = await fetch(`${OCM_URL}?${params.toString()}`, {
      headers: { "User-Agent": "Flux-TripPlanner/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];

    const mapped = (data as OcmPoi[])
      .map(ocmToStation)
      .filter((s): s is ChargingStation => s !== null);
    return preferFast(mapped);
  } catch {
    return [];
  }
}

/**
 * Legacy fallback: fetch corridor stations directly from OpenStreetMap
 * (Overpass). Returns [] on any error so the caller can fall back to the static
 * station set.
 */
export async function fetchCorridorStationsOverpass(
  polyline: [number, number][] | null,
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<ChargingStation[]> {
  try {
    const bbox = computeBBox(polyline, origin, destination);
    // Skip Overpass for very large corridors — query would hit the 20s timeout
    // and return zero results. The static STATIONS list covers these long routes.
    if (bbox.maxLat - bbox.minLat > 5 || bbox.maxLng - bbox.minLng > 8) return [];
    const box = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
    const query = `[out:json][timeout:20];(node["amenity"="charging_station"](${box});way["amenity"="charging_station"](${box}););out body center 500;`;

    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Flux-TripPlanner/1.0",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(22000),
    });

    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!isOverpassResponse(data) || !data.elements) return [];

    const mapped = data.elements
      .map(mapElement)
      .filter((s): s is ChargingStation => s !== null);

    return preferFast(mapped);
  } catch {
    return [];
  }
}
