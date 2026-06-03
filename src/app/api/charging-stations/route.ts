import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { STATIONS } from "@/lib/external/charging-networks/stations";
import { haversine } from "@/lib/external/routing/providers/mock-router";

export interface ChargingStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  connectorCount: number;
  maxPowerKw: number | null;
  isOperational: boolean;
  town?: string;
}

// OpenChargeMap v3 POI shape (only the fields we use)
interface OcmConnection {
  PowerKW?: number | null;
}

interface OcmStatusType {
  IsOperational?: boolean | null;
}

interface OcmAddressInfo {
  Title?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
  Town?: string | null;
}

interface OcmPoi {
  ID?: number | null;
  AddressInfo?: OcmAddressInfo | null;
  Connections?: OcmConnection[] | null;
  StatusType?: OcmStatusType | null;
}

function isOcmPoi(value: unknown): value is OcmPoi {
  return typeof value === "object" && value !== null;
}

function mapPoi(poi: OcmPoi): ChargingStation | null {
  const info = poi.AddressInfo;
  if (!info) return null;

  const lat = info.Latitude;
  const lng = info.Longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const connections = Array.isArray(poi.Connections) ? poi.Connections : [];
  const maxPowerKw =
    connections.reduce<number | null>((acc, c) => {
      const kw = typeof c.PowerKW === "number" ? c.PowerKW : null;
      if (kw === null) return acc;
      return acc === null ? kw : Math.max(acc, kw);
    }, null);

  return {
    id: String(poi.ID ?? `ocm-${lat}-${lng}`),
    name: info.Title ?? "Charging Station",
    lat,
    lng,
    connectorCount: connections.length,
    maxPowerKw,
    isOperational: poi.StatusType?.IsOperational ?? true,
    town: info.Town ?? undefined,
  };
}

// Overpass OSM node/way shape (only fields we use)
interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function parseMaxPowerKw(tags: Record<string, string>): number | null {
  const raw = tags["maxpower"] ?? tags["socket:type2:output"] ?? tags["socket:chademo:output"] ?? null;
  if (!raw) return null;
  const match = /(\d+(?:\.\d+)?)\s*(kW|W)?/i.exec(raw);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = (match[2] ?? "W").toLowerCase();
  return unit === "kw" ? val : val / 1000;
}

async function fetchOverpassStations(lat: number, lng: number, radiusKm: number, max: number): Promise<ChargingStation[]> {
  const radiusM = radiusKm * 1000;
  const query = `[out:json][timeout:20];(node["amenity"="charging_station"](around:${radiusM},${lat},${lng});way["amenity"="charging_station"](around:${radiusM},${lat},${lng}););out body center ${max};`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(22000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { elements?: OverpassElement[] };
    const elements = data.elements ?? [];
    return elements.flatMap((el): ChargingStation[] => {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (typeof elLat !== "number" || typeof elLng !== "number") return [];
      const tags = el.tags ?? {};
      const capacity = parseInt(tags["capacity"] ?? "1", 10);
      return [{
        id: `osm-${el.type}-${el.id}`,
        name: tags["name"] ?? tags["operator"] ?? "Charging Station",
        lat: elLat,
        lng: elLng,
        connectorCount: isFinite(capacity) && capacity > 0 ? capacity : 1,
        maxPowerKw: parseMaxPowerKw(tags),
        isOperational: tags["operational_status"] !== "closed",
        town: tags["addr:city"] ?? tags["addr:suburb"] ?? undefined,
      }];
    });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(session.user.id, "charging-map", 60);
  if (!allowed) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ message: "lat and lng are required" }, { status: 400 });
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!isFinite(latNum) || !isFinite(lngNum)) {
    return NextResponse.json({ message: "lat and lng must be finite numbers" }, { status: 400 });
  }

  const radius = Number(searchParams.get("radius") ?? "25");
  const maxResults = Number(searchParams.get("maxResults") ?? "100");

  const apiKey = process.env.OPEN_CHARGE_MAP_API_KEY ?? "";

  const ocmUrl = new URL("https://api.openchargemap.io/v3/poi/");
  ocmUrl.searchParams.set("output", "json");
  ocmUrl.searchParams.set("latitude", String(latNum));
  ocmUrl.searchParams.set("longitude", String(lngNum));
  ocmUrl.searchParams.set("distance", String(radius));
  ocmUrl.searchParams.set("distanceunit", "km");
  ocmUrl.searchParams.set("maxresults", String(maxResults));
  ocmUrl.searchParams.set("compact", "true");
  ocmUrl.searchParams.set("verbose", "false");
  if (apiKey) {
    ocmUrl.searchParams.set("key", apiKey);
  }

  let raw: unknown;
  let ocmOk = false;
  try {
    const res = await fetch(ocmUrl.toString(), {
      headers: { "Accept": "application/json" },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      raw = await res.json();
      ocmOk = true;
    }
  } catch {
    // fall through to Overpass fallback
  }

  if (ocmOk && Array.isArray(raw)) {
    const stations: ChargingStation[] = [];
    for (const item of raw) {
      if (!isOcmPoi(item)) continue;
      const station = mapPoi(item);
      if (station) stations.push(station);
    }
    if (stations.length > 0) return NextResponse.json(stations);
  }

  // Overpass API fallback — free, no key needed, good global coverage
  const overpassStations = await fetchOverpassStations(latNum, lngNum, radius, maxResults);
  if (overpassStations.length > 0) return NextResponse.json(overpassStations);

  const center = { lat: latNum, lng: lngNum };
  const fallback: ChargingStation[] = STATIONS
    .filter((s) => haversine(center, s) <= radius)
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      connectorCount: s.totalStalls,
      maxPowerKw: s.maxKw,
      isOperational: true,
      town: s.addressCity,
    }));
  return NextResponse.json(fallback);
}
