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
  return computeOsrmRouteVia([origin, destination]);
}

/**
 * Ask OSRM for up to `max` alternative roads between two points. Returns one
 * result per distinct road. Falls back to a single haversine route on error.
 */
export async function computeOsrmAlternatives(
  origin: RoutePoint,
  destination: RoutePoint,
  max = 3,
): Promise<OsrmResult[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=${max}`;

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
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("OSRM no route");

    return data.routes.slice(0, max).map((route) => ({
      distanceKm: Math.round(route.distance / 100) / 10,
      drivingMinutes: Math.round(route.duration / 60),
      polyline: route.geometry,
    }));
  } catch {
    clearTimeout(timeoutId);
    return [await computeOsrmRoute(origin, destination)];
  }
}

/**
 * Route through an ordered list of waypoints (origin, …stops, destination).
 * Returns the combined distance/duration and the polyline that actually passes
 * through every waypoint. Falls back to chained haversine when OSRM is down.
 */
export async function computeOsrmRouteVia(points: RoutePoint[]): Promise<OsrmResult> {
  if (points.length < 2) {
    return { distanceKm: 0, drivingMinutes: 0, polyline: null };
  }

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

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
    // Fallback: sum haversine between consecutive waypoints × 1.25 road factor.
    let greatCircle = 0;
    for (let i = 1; i < points.length; i++) {
      greatCircle += haversine(points[i - 1]!, points[i]!);
    }
    const distanceKm = Math.round(greatCircle * 1.25 * 10) / 10;
    return {
      distanceKm,
      drivingMinutes: Math.round((distanceKm / 95) * 60),
      polyline: null,
    };
  }
}
