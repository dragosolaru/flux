import type { RoutePoint } from "../types";
import { haversine } from "./mock-router";

interface OsrmRoute {
  distance: number;   // meters
  duration: number;   // seconds
  geometry: {
    type: "LineString";
    coordinates: [number, number][]; // [lng, lat]
  };
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
}

export interface OsrmResult {
  distanceKm: number;
  drivingMinutes: number;
  polyline: { type: "LineString"; coordinates: [number, number][] } | null;
}

export async function computeOsrmRoute(origin: RoutePoint, destination: RoutePoint): Promise<OsrmResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Flux-TripPlanner/1.0" },
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json() as OsrmResponse;

    if (data.code !== "Ok" || !data.routes?.[0]) throw new Error("OSRM no route");

    const route = data.routes[0];
    return {
      distanceKm: Math.round(route.distance / 100) / 10,
      drivingMinutes: Math.round(route.duration / 60),
      polyline: route.geometry,
    };
  } catch {
    clearTimeout(timeoutId);
    // Fallback to haversine
    const greatCircle = haversine(origin, destination);
    const distanceKm = Math.round(greatCircle * 1.25 * 10) / 10;
    return {
      distanceKm,
      drivingMinutes: Math.round((distanceKm / 95) * 60),
      polyline: null,
    };
  }
}
