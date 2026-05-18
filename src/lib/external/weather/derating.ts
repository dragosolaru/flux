import type { WeatherSnapshot, RangeDerating } from "./types";

/**
 * Compute weather-based range derating from an ideal range.
 *
 * Temperature: −0.5%/°C below 15°C, +0.2%/°C above 25°C (heat hurts AC)
 * Wind:        −1% per 5 m/s headwind (we assume worst-case heading)
 * Precip:      −3% when actively raining/snowing
 */
export function derateRange(idealKm: number, weather: WeatherSnapshot): RangeDerating {
  let tempPct = 0;
  if (weather.tempC < 15) {
    tempPct = (weather.tempC - 15) * 0.5; // e.g. −5°C → −10%
  } else if (weather.tempC > 25) {
    tempPct = -(weather.tempC - 25) * 0.2;
  }
  tempPct = Math.max(tempPct, -40); // floor at −40%

  const windPct = -(weather.windSpeedMs / 5) * 1;
  const precipPct = weather.precipMmH > 0 ? -3 : 0;

  const totalPct = Math.round((tempPct + windPct + precipPct) * 10) / 10;
  const deratedKm = Math.round(idealKm * (1 + totalPct / 100));

  return {
    idealKm,
    deratedKm: Math.max(0, deratedKm),
    totalPct,
    factors: {
      tempPct: Math.round(tempPct * 10) / 10,
      windPct: Math.round(windPct * 10) / 10,
      precipPct,
    },
  };
}
