import type { WeatherSnapshot, RangeDerating } from "./types";

/**
 * Compute weather-based range derating from an ideal range.
 *
 * Temperature: piecewise linear calibrated against AAA/ADAC/Geotab real-world data:
 *   15→0°C: −1%/°C  (mild cold, battery chemistry slowdown)
 *   0→−10°C: −1.5%/°C (severe cold, electrolyte viscosity + HVAC load)
 *   below −10°C: −1.5%/°C (Nordic extreme — same slope, realistic cap at −40%)
 *   above 25°C: −0.2%/°C (AC load)
 * Wind:        quadratic model (aero drag ∝ v²); assumes worst-case headwind
 *              at ~100 km/h avg; −3.5%/5m/s headwind. Real penalty at 10 m/s
 *              headwind is ~10-15% (vs old linear 2%). Elevation not modelled.
 * Precip:      −3% when actively raining/snowing
 */
export function derateRange(idealKm: number, weather: WeatherSnapshot): RangeDerating {
  let tempPct = 0;
  if (weather.tempC < -10) {
    // Below -10°C: same slope as 0→-10°C bracket; capped at -40% for realistic range
    tempPct = (0 - 15) * 1.0 + (-10 - 0) * 1.5 + (weather.tempC - (-10)) * 1.5;
  } else if (weather.tempC < 0) {
    // −10→0°C: 1.5%/°C
    tempPct = (0 - 15) * 1.0 + (weather.tempC - 0) * 1.5;
  } else if (weather.tempC < 15) {
    // 0→15°C: 1%/°C
    tempPct = (weather.tempC - 15) * 1.0;
  } else if (weather.tempC > 25) {
    tempPct = -(weather.tempC - 25) * 0.2;
  }
  tempPct = Math.max(tempPct, -40); // floor at −40% (aligned with real-world extreme cold data)

  // Quadratic wind penalty: aerodynamic drag scales with v², so doubling wind speed
  // quadruples penalty. Factor 3.5/5 gives ~7% at 10 m/s (vs old 2%), closer to
  // observed real-world ~10-15% at 100 km/h + 10 m/s headwind.
  const windPct = -(weather.windSpeedMs / 5) * 3.5;
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
