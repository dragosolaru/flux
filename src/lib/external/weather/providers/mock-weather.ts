import type { WeatherProvider, WeatherSnapshot } from "../types";

// Deterministic seasonal/diurnal temperature for a location and time.
// Central Europe bias (lat 48–52) → mild temperate. Exported so the mock
// simulator can stamp consistent temperatures onto snapshots and trips.
export function seasonalTempC(lat: number, at: Date = new Date()): number {
  const hour = at.getHours();
  const dayOfYear = Math.floor(
    (at.getTime() - new Date(at.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );

  // Seasonal base temperature: peaks in July (day ~196), troughs in Jan (day ~16)
  const seasonalBase = 12 + 12 * Math.sin(((dayOfYear - 80) / 365) * 2 * Math.PI);
  // Latitude correction: cooler further north
  const latCorrection = (lat - 48) * -0.5;
  // Diurnal: +5°C around 14:00, -5°C around 04:00
  const diurnal = 5 * Math.sin(((hour - 4) / 24) * 2 * Math.PI);

  return Math.round((seasonalBase + latCorrection + diurnal) * 10) / 10;
}

// Deterministic mock: varies by lat (climate zone) and hour of day.
function getCurrent(lat: number, lng: number): WeatherSnapshot {
  const now = new Date();
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  );

  const tempC = seasonalTempC(lat, now);

  // Wind: higher in winter, varies by longitude pseudo-randomly
  const windBase = 3 + 3 * Math.cos(((dayOfYear - 80) / 365) * 2 * Math.PI);
  const windSpeedMs = Math.max(0, Math.round((windBase + ((lng * 7) % 3)) * 10) / 10);
  const windDirDeg = Math.round(((lng * 37 + dayOfYear * 13) % 360));

  // Precipitation: ~20% chance, higher in shoulder seasons
  const precipChance = 0.15 + 0.1 * Math.abs(Math.sin(((dayOfYear - 100) / 180) * Math.PI));
  const precipSeed = (dayOfYear * 17 + Math.floor(lng)) % 100;
  const precipMmH = precipSeed < precipChance * 100 ? 1.5 : 0;

  // Cloud cover: correlated with precip
  const cloudCoverPct = precipMmH > 0 ? 90 : Math.min(80, Math.round((precipSeed % 60) + 10));

  const humidityPct = Math.min(95, Math.round(55 + (precipMmH > 0 ? 30 : 0) + cloudCoverPct * 0.2));

  const conditionLabel =
    precipMmH > 0
      ? tempC < 0
        ? "Snow"
        : "Rain"
      : cloudCoverPct > 70
        ? "Cloudy"
        : cloudCoverPct > 30
          ? "Partly cloudy"
          : "Clear";

  return { tempC, windSpeedMs, windDirDeg, precipMmH, cloudCoverPct, humidityPct, conditionLabel };
}

export const mockWeather: WeatherProvider = {
  id: "mock-weather",
  displayName: "Mock weather",
  getCurrent,
};
