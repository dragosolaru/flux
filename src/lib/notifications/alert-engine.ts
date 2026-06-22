import type { VehicleState, MotionState } from "@/types/vehicle";
import type { WeatherSnapshot } from "@/lib/external/weather/types";
import type { Alert, NotificationPreferences } from "@/types/notifications";

// ~80 km/h in m/s — the severe-wind threshold for the hail/storm alert.
const SEVERE_WIND_MS = 22;
const HEAT_TEMP_C = 35;
const FREEZE_TEMP_C = 0;
const RAIN_PRECIP_MMH = 0.1;

// A vehicle that isn't actively driving is exposed to the weather at its
// parked location — charging and plugged-idle count as stationary too.
function isStationary(motion: MotionState | null): boolean {
  return motion === "parked" || motion === "charging" || motion === "plugged-idle";
}

function anyWindowOpen(vehicle: VehicleState): boolean {
  const w = vehicle.windowsOpen;
  if (!w) return false;
  return w.frontLeft || w.frontRight || w.rearLeft || w.rearRight;
}

function labelIncludes(label: string, ...needles: string[]): boolean {
  const lower = label.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/**
 * Pure alert evaluator — no DB, no I/O, no i18n. Returns the alerts that should
 * fire for the given vehicle + weather, honouring the user's per-scenario
 * opt-ins. The caller (cron) handles dedup and dispatch.
 */
export function evaluateAlerts(
  vehicle: VehicleState,
  weather: WeatherSnapshot,
  prefs: NotificationPreferences,
): Alert[] {
  if (!isStationary(vehicle.motionState)) return [];

  const alerts: Alert[] = [];
  const name = vehicle.displayName;

  // Rain + windows open. Silently skipped when window state is unknown
  // (live Tesla returns null today — see spec §7).
  if (
    prefs.notifyRainWindows &&
    weather.precipMmH > RAIN_PRECIP_MMH &&
    anyWindowOpen(vehicle)
  ) {
    alerts.push({
      type: "rain_windows",
      titleKey: "rain_windows.title",
      bodyKey: "rain_windows.body",
      params: { name },
      url: "/dashboard",
      tag: "rain_windows",
    });
  }

  // Freeze / snow / ice.
  if (
    prefs.notifyFreeze &&
    (weather.tempC <= FREEZE_TEMP_C || labelIncludes(weather.conditionLabel, "snow", "ice", "sleet"))
  ) {
    alerts.push({
      type: "freeze",
      titleKey: "freeze.title",
      bodyKey: "freeze.body",
      params: { name },
      url: "/dashboard",
      tag: "freeze",
    });
  }

  // Heat wave.
  if (prefs.notifyHeat && weather.tempC >= HEAT_TEMP_C) {
    alerts.push({
      type: "heat",
      titleKey: "heat.title",
      bodyKey: "heat.body",
      params: { name },
      url: "/dashboard",
      tag: "heat",
    });
  }

  // Hail / severe storm / strong wind.
  if (
    prefs.notifyHail &&
    (labelIncludes(weather.conditionLabel, "hail", "thunder", "storm") ||
      weather.windSpeedMs >= SEVERE_WIND_MS)
  ) {
    alerts.push({
      type: "hail",
      titleKey: "hail.title",
      bodyKey: "hail.body",
      params: { name },
      url: "/dashboard",
      tag: "hail",
    });
  }

  return alerts;
}
