import type { RoutePoint } from "../types";
import type { OsrmResult } from "./osrm-router";

// TomTom Routing API — traffic-aware ETAs (like Waze/Google) plus genuine road
// alternatives. Opt-in via TOMTOM_API_KEY (same key as the EV station source);
// returns [] / null when absent so the caller falls back to ORS/OSRM.

interface TomTomPoint {
  latitude: number;
  longitude: number;
}

interface TomTomLeg {
  points?: TomTomPoint[];
}

interface TomTomRoute {
  summary?: {
    lengthInMeters?: number;
    travelTimeInSeconds?: number;
    trafficDelayInSeconds?: number;
  };
  legs?: TomTomLeg[];
}

interface TomTomResponse {
  routes?: TomTomRoute[];
}

function routeToResult(route: TomTomRoute): OsrmResult {
  const lengthM = route.summary?.lengthInMeters ?? 0;
  const timeS = route.summary?.travelTimeInSeconds ?? 0;
  const delayS = route.summary?.trafficDelayInSeconds ?? 0;

  const coords: [number, number][] = [];
  for (const leg of route.legs ?? []) {
    for (const p of leg.points ?? []) {
      // GeoJSON order is [lng, lat] to match OSRM/ORS polylines.
      coords.push([p.longitude, p.latitude]);
    }
  }

  return {
    distanceKm: Math.round(lengthM / 100) / 10,
    drivingMinutes: Math.round(timeS / 60),
    polyline: coords.length >= 2 ? { type: "LineString", coordinates: coords } : null,
    trafficDelayMinutes: Math.round(delayS / 60),
  };
}

async function call(path: string, params: Record<string, string>): Promise<TomTomResponse | null> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) return null;

  const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${path}/json`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("traffic", "true");
  url.searchParams.set("travelMode", "car");
  url.searchParams.set("routeType", "fastest");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return null;
  return (await res.json()) as TomTomResponse;
}

/** Up to `max` traffic-aware road alternatives. [] when no key or on error. */
export async function computeTomTomAlternatives(
  origin: RoutePoint,
  destination: RoutePoint,
  max = 3,
): Promise<OsrmResult[]> {
  try {
    const path = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
    const data = await call(path, { maxAlternatives: String(Math.max(0, max - 1)) });
    if (!data?.routes?.length) return [];
    return data.routes.slice(0, max).map(routeToResult);
  } catch {
    return [];
  }
}

/** Traffic-aware route through ordered waypoints. null when no key or on error. */
export async function computeTomTomRouteVia(points: RoutePoint[]): Promise<OsrmResult | null> {
  if (points.length < 2) return null;
  try {
    const path = points.map((p) => `${p.lat},${p.lng}`).join(":");
    const data = await call(path, {});
    const route = data?.routes?.[0];
    return route ? routeToResult(route) : null;
  } catch {
    return null;
  }
}
