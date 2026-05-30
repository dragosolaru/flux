import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

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
  try {
    const res = await fetch(ocmUrl.toString(), {
      headers: { "Accept": "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { message: `OpenChargeMap error: ${res.status}` },
        { status: 502 },
      );
    }
    raw = await res.json();
  } catch {
    return NextResponse.json({ message: "Failed to reach OpenChargeMap" }, { status: 502 });
  }

  if (!Array.isArray(raw)) {
    return NextResponse.json({ message: "Unexpected response from OpenChargeMap" }, { status: 502 });
  }

  const stations: ChargingStation[] = [];
  for (const item of raw) {
    if (!isOcmPoi(item)) continue;
    const station = mapPoi(item);
    if (station) stations.push(station);
  }

  return NextResponse.json(stations);
}
