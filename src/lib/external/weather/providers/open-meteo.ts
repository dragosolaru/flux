import type { WeatherProvider, WeatherSnapshot } from "../types";

// Open-Meteo public API — no API key required; commercial use requires a paid plan.
// Endpoint: https://open-meteo.com/en/docs
const BASE_URL = "https://api.open-meteo.com/v1/forecast";

function conditionLabel(tempC: number, precip: number, cloudCover: number): string {
  if (precip > 0) return tempC < 0 ? "Snow" : "Rain";
  if (cloudCover > 70) return "Cloudy";
  if (cloudCover > 30) return "Partly cloudy";
  return "Clear";
}

async function getCurrent(lat: number, lng: number): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,relative_humidity_2m",
    wind_speed_unit: "ms",
    forecast_days: "1",
    timeformat: "unixtime",
  });

  const res = await fetch(`${BASE_URL}?${params}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 900 }, // 15 min cache — weather changes slowly
  });

  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
      precipitation?: number;
      cloud_cover?: number;
      relative_humidity_2m?: number;
    };
  };

  const c = data.current ?? {};
  const tempC = c.temperature_2m ?? 15;
  const windSpeedMs = c.wind_speed_10m ?? 0;
  const windDirDeg = c.wind_direction_10m ?? 0;
  const precipMmH = c.precipitation ?? 0;
  const cloudCoverPct = c.cloud_cover ?? 0;
  const humidityPct = c.relative_humidity_2m ?? 50;

  return {
    tempC,
    windSpeedMs,
    windDirDeg,
    precipMmH,
    cloudCoverPct,
    humidityPct,
    conditionLabel: conditionLabel(tempC, precipMmH, cloudCoverPct),
  };
}

// Synchronous WeatherProvider wrapper: fetches weather lazily and caches per
// (lat,lng) rounded to 0.1°. Falls back to mock-weather if the fetch fails —
// so the trip planner never hard-fails for weather alone.
interface WeatherCacheEntry {
  snapshot: WeatherSnapshot;
  fetchedAt: number; // Date.now()
}

// 30 min TTL — forecasts change slowly but must not be served indefinitely.
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, WeatherCacheEntry>();

function getFresh(key: string): WeatherSnapshot | undefined {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.snapshot;
  }
  return undefined;
}

export const openMeteoWeather: WeatherProvider = {
  id: "open-meteo",
  displayName: "Open-Meteo",
  getCurrent(lat: number, lng: number): WeatherSnapshot {
    const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
    // Return cached if still fresh
    const cached = getFresh(key);
    if (cached) return cached;

    // Fire-and-forget: kick off the fetch so the next call gets real data.
    // The first call (and any expired entry) returns a neutral mild snapshot.
    getCurrent(lat, lng)
      .then((snap) => cache.set(key, { snapshot: snap, fetchedAt: Date.now() }))
      .catch(() => {}); // silence — fallback to mild snap

    // Mild neutral snapshot for the first hit (avoids blocking the planner).
    return { tempC: 15, windSpeedMs: 3, windDirDeg: 270, precipMmH: 0, cloudCoverPct: 30, humidityPct: 60, conditionLabel: "Partly cloudy" };
  },
};

/**
 * Async version for use in server-side planners — awaits the real weather.
 * Falls back to the neutral snapshot on error so the planner never hard-fails.
 */
export async function getWeatherAsync(lat: number, lng: number): Promise<WeatherSnapshot> {
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  const cached = getFresh(key);
  if (cached) return cached;
  try {
    const snap = await getCurrent(lat, lng);
    cache.set(key, { snapshot: snap, fetchedAt: Date.now() });
    return snap;
  } catch {
    return { tempC: 15, windSpeedMs: 3, windDirDeg: 270, precipMmH: 0, cloudCoverPct: 30, humidityPct: 60, conditionLabel: "Partly cloudy" };
  }
}
