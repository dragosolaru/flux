import { findInBBox } from "@/lib/chargers/query";
import type { Charger, ConnectorType } from "@/lib/chargers/types";
import type { ChargingStation, NetworkId, PlugType } from "@/lib/external/charging-networks/types";
import type { RoutePoint } from "./types";
import { haversine } from "./providers/mock-router";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OCM_URL = "https://api.openchargemap.io/v3/poi/";
const BBOX_PAD_DEG = 0.15;
const FAST_KW_THRESHOLD = 40;
const MAX_STATIONS = 800;
// Corridor sampling: walk the route polyline and query a small bbox around
// evenly-spaced points so a long international route gets dense coverage along
// its whole length, instead of one giant bbox capped at 500 (which left huge
// gaps mid-route, e.g. Serbia/Croatia on Florești→Rome).
const SAMPLE_PAD_DEG = 0.45; // ~50 km half-box; overlaps the next sample.
const MAX_SAMPLE_BOXES = 16; // cap OCM calls for very long routes.

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

// Evenly-spaced sample bboxes along the route polyline (by distance), each padded
// so consecutive boxes overlap — no gaps. Capped at MAX_SAMPLE_BOXES.
function corridorSampleBoxes(polyline: [number, number][]): BBox[] {
  const pts = polyline.map(([lng, lat]) => ({ lat, lng }));
  if (pts.length === 0) return [];

  let total = 0;
  for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1]!, pts[i]!);
  const step = Math.max(60, total / MAX_SAMPLE_BOXES); // km between samples

  const boxAround = (p: { lat: number; lng: number }): BBox => ({
    minLat: p.lat - SAMPLE_PAD_DEG,
    minLng: p.lng - SAMPLE_PAD_DEG,
    maxLat: p.lat + SAMPLE_PAD_DEG,
    maxLng: p.lng + SAMPLE_PAD_DEG,
  });

  const boxes: BBox[] = [boxAround(pts[0]!)];
  let acc = 0;
  let nextAt = step;
  for (let i = 1; i < pts.length; i++) {
    acc += haversine(pts[i - 1]!, pts[i]!);
    if (acc >= nextAt && boxes.length < MAX_SAMPLE_BOXES) {
      boxes.push(boxAround(pts[i]!));
      nextAt += step;
    }
  }
  return boxes;
}

function dedupeById(stations: ChargingStation[]): ChargingStation[] {
  const byId = new Map<string, ChargingStation>();
  for (const s of stations) byId.set(s.id, s);
  return [...byId.values()];
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
  // Surface the platform's availability so the trip's reliability badge reflects
  // real status: operational → up, offline → down, stale/unknown → unspecified.
  const isOperational =
    charger.availability === "operational"
      ? true
      : charger.availability === "offline"
        ? false
        : undefined;
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
    isOperational,
  };
}

// Merge two station lists, dropping entries from `extra` that sit within ~60 m of
// one already in `primary` (the same physical site from another source). Primary
// wins because it's the richer PostGIS row (price, plug types, availability).
function mergeByProximity(
  primary: ChargingStation[],
  extra: ChargingStation[],
): ChargingStation[] {
  const SAME_SITE_KM = 0.06;
  const result = [...primary];
  for (const e of extra) {
    const dup = primary.some((p) => haversine(p, e) <= SAME_SITE_KM);
    if (!dup) result.push(e);
  }
  return result;
}

/**
 * Fetch fast-charging stations within a bounding box around the route corridor.
 *
 * The planner needs comprehensive coverage *now* (so it sees as many stations as
 * the map and can place stops well), without blocking on a slow full-corridor
 * ingest. So we query two fast sources in parallel and merge them:
 *   - the PostGIS platform (whatever the map browsing + warm cron already stored,
 *     with rich fields: price, plug types, availability), and
 *   - a direct Open Charge Map corridor query (comprehensive, fast with an API
 *     key), covering corridor segments that haven't been ingested yet.
 * Overpass is the last-resort fallback if both come back empty (e.g. OCM down or
 * the charger migrations not yet applied).
 */
export async function fetchCorridorStations(
  polyline: [number, number][] | null,
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<ChargingStation[]> {
  const bbox = computeBBox(polyline, origin, destination);

  // Sample OCM along the route in segments so coverage stays dense over the whole
  // corridor (a single huge bbox capped at 500 left mid-route gaps). One fast
  // PostGIS query over the full bbox supplies the richer stored rows.
  const sampleBoxes =
    polyline && polyline.length >= 2 ? corridorSampleBoxes(polyline) : [bbox];

  const [dbStations, ocmLists] = await Promise.all([
    findInBBox({ bbox, limit: 1000 })
      .then((chargers) => chargers.map(chargerToStation))
      .catch(() => [] as ChargingStation[]),
    Promise.all(
      sampleBoxes.map((b) =>
        fetchCorridorStationsOCM(b, 150).catch(() => [] as ChargingStation[]),
      ),
    ),
  ]);

  const ocmStations = dedupeById(ocmLists.flat());
  const merged = mergeByProximity(dbStations, ocmStations);
  if (merged.length > 0) return preferFast(merged);

  // Both primary sources empty → live Overpass as a final fallback.
  return fetchCorridorStationsOverpass(polyline, origin, destination);
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
export async function fetchCorridorStationsOCM(bbox: BBox, maxResults = 500): Promise<ChargingStation[]> {
  try {
    const params = new URLSearchParams({
      output: "json",
      // OCM boundingbox: (lat,lng),(lat,lng) — top-left, bottom-right.
      boundingbox: `(${bbox.maxLat},${bbox.minLng}),(${bbox.minLat},${bbox.maxLng})`,
      maxresults: String(maxResults),
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
