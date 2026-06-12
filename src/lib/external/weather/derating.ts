import type { WeatherSnapshot, RangeDerating } from "./types";

/**
 * Compute weather-based range derating from an ideal range.
 *
 * Temperature: piecewise model calibrated against real-world EV cold-weather data:
 *   15→0°C: −1%/°C  (mild cold, battery chemistry slowdown)
 *   0→−10°C: −1.5%/°C (severe cold, electrolyte viscosity + HVAC load)
 *   below −10°C: −2%/°C (Nordic extreme, significant capacity reduction)
 *   above 25°C: −0.2%/°C (AC load)
 * Wind:        −1% per 5 m/s headwind (worst-case heading assumed)
 * Precip:      −3% when actively raining/snowing
 */
export function derateRange(idealKm: number, weather: WeatherSnapshot): RangeDerating {
  let tempPct = 0;
  if (weather.tempC < -10) {
    // Below -10°C: steep 2%/°C — Nordic extreme cold
    tempPct = (0 - 15) * 1.0 + (-10 - 0) * 1.5 + (weather.tempC - (-10)) * 2.0;
  } else if (weather.tempC < 0) {
    // −10→0°C: 1.5%/°C
    tempPct = (0 - 15) * 1.0 + (weather.tempC - 0) * 1.5;
  } else if (weather.tempC < 15) {
    // 0→15°C: 1%/°C
    tempPct = (weather.tempC - 15) * 1.0;
  } else if (weather.tempC > 25) {
    tempPct = -(weather.tempC - 25) * 0.2;
  }
  tempPct = Math.max(tempPct, -50); // floor at −50% (extreme arctic)

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
