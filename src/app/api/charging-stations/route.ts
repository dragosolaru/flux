import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { STATIONS } from "@/lib/external/charging-networks/stations";
import { haversine } from "@/lib/external/routing/providers/mock-router";
import { fetchLiveStations } from "@/lib/external/charging-networks/live-stations";
import type { ChargingStation } from "@/lib/external/charging-networks/live-stations";

// Re-exported so existing importers of `@/app/api/charging-stations/route` keep working.
export type { ChargingStation };

// Give the external station lookups room to finish (Overpass mirrors).
export const maxDuration = 30;

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

  const radius = Math.min(Math.max(Number(searchParams.get("radius") ?? "25"), 1), 100);
  const maxResults = Math.min(Math.max(Number(searchParams.get("maxResults") ?? "200"), 1), 200);

  // Query OpenChargeMap and Overpass in parallel, then merge + de-duplicate.
  const live = await fetchLiveStations(latNum, lngNum, radius, maxResults);
  if (live.length > 0) return NextResponse.json(live);

  // Static dataset is the final fallback only when both live sources are empty.
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
