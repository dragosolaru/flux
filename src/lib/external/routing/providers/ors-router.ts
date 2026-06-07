import type { RoutePoint } from "../types";
import type { OsrmResult } from "./osrm-router";

interface OrsFeature {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: { summary?: { distance?: number; duration?: number } };
}

interface OrsResponse {
  features?: OrsFeature[];
}

const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

/**
 * Ask OpenRouteService for up to `max` genuinely distinct roads between two
 * points. ORS's `alternative_routes` algorithm returns roads that differ by at
 * least `share_factor` — unlike OSRM's public server, which rarely returns more
 * than the single fastest road for long corridors (e.g. Cluj→București has the
 * A1-via-Sibiu and the Brașov/DN1 roads, but OSRM public surfaces only one).
 *
 * Returns [] when no key is configured or the request fails, so the caller can
 * fall back to OSRM. Same opt-in pattern as the Open Charge Map integration.
 */
export async function computeOrsAlternatives(
  origin: RoutePoint,
  destination: RoutePoint,
  max = 3,
): Promise<OsrmResult[]> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(ORS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [origin.lng, origin.lat],
          [destination.lng, destination.lat],
        ],
        // share_factor 0.7: allow up to 70% shared path — Romanian long-distance
        // roads overlap heavily near city bypasses so 0.6 rejects real alternatives.
        // weight_factor 1.4: accept routes up to 40% longer than the fastest.
        alternative_routes: { target_count: max, share_factor: 0.7, weight_factor: 1.4 },
        instructions: false,
      }),
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const data = (await res.json()) as OrsResponse;
    if (!data.features?.length) return [];

    return data.features.slice(0, max).map((f) => ({
      distanceKm: Math.round((f.properties.summary?.distance ?? 0) / 100) / 10,
      drivingMinutes: Math.round((f.properties.summary?.duration ?? 0) / 60),
      polyline: f.geometry,
    }));
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}
