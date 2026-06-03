import type { ChargingStation, NetworkId, PlugType } from "@/lib/external/charging-networks/types";
import type { RoutePoint } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
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

/**
 * Fetch real fast-charging stations within a bounding box around the route
 * corridor from OpenStreetMap (Overpass). Returns [] on any error so the
 * caller can fall back to the static station set.
 */
export async function fetchCorridorStations(
  polyline: [number, number][] | null,
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<ChargingStation[]> {
  try {
    const bbox = computeBBox(polyline, origin, destination);
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

    const fast = mapped.filter((s) => s.maxKw >= FAST_KW_THRESHOLD);
    const selected = fast.length >= 3 ? fast : mapped;

    return selected.slice(0, MAX_STATIONS);
  } catch {
    return [];
  }
}
