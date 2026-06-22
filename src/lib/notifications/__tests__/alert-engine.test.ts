import { describe, it, expect } from "vitest";

import { evaluateAlerts } from "../alert-engine";
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@/types/notifications";
import type { VehicleState } from "@/types/vehicle";
import type { WeatherSnapshot } from "@/lib/external/weather/types";

const prefs: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };

function vehicle(overrides: Partial<VehicleState> = {}): VehicleState {
  return {
    vehicleId: "v1",
    displayName: "Model 3",
    motionState: "parked",
    latitude: 44.4,
    longitude: 26.1,
    exteriorTempC: 18,
    windowsOpen: null,
    lastSeenAt: "2026-06-22T10:00:00.000Z",
    recordedAt: "2026-06-22T10:00:00.000Z",
    // The engine only reads the fields above; cast covers the rest of VehicleState.
    ...overrides,
  } as VehicleState;
}

function weather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    tempC: 18,
    windSpeedMs: 3,
    windDirDeg: 270,
    precipMmH: 0,
    cloudCoverPct: 20,
    humidityPct: 50,
    conditionLabel: "Clear",
    ...overrides,
  };
}

const allWindowsClosed = { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false };

describe("evaluateAlerts", () => {
  it("returns nothing for a calm, parked car", () => {
    expect(evaluateAlerts(vehicle(), weather(), prefs)).toEqual([]);
  });

  it("skips everything while driving", () => {
    const alerts = evaluateAlerts(
      vehicle({ motionState: "driving" }),
      weather({ tempC: 40, precipMmH: 5 }),
      prefs,
    );
    expect(alerts).toEqual([]);
  });

  it("fires rain_windows only when a window is open", () => {
    const rainy = weather({ precipMmH: 2 });
    expect(
      evaluateAlerts(vehicle({ windowsOpen: allWindowsClosed }), rainy, prefs).map((a) => a.type),
    ).not.toContain("rain_windows");
    expect(
      evaluateAlerts(
        vehicle({ windowsOpen: { ...allWindowsClosed, frontLeft: true } }),
        rainy,
        prefs,
      ).map((a) => a.type),
    ).toContain("rain_windows");
  });

  it("skips rain_windows when window state is unknown (live Tesla)", () => {
    const alerts = evaluateAlerts(vehicle({ windowsOpen: null }), weather({ precipMmH: 2 }), prefs);
    expect(alerts.map((a) => a.type)).not.toContain("rain_windows");
  });

  it("fires freeze on sub-zero temp or snow label", () => {
    expect(evaluateAlerts(vehicle(), weather({ tempC: -3 }), prefs).map((a) => a.type)).toContain("freeze");
    expect(
      evaluateAlerts(vehicle(), weather({ tempC: 1, conditionLabel: "Snow" }), prefs).map((a) => a.type),
    ).toContain("freeze");
  });

  it("fires heat at or above 35°C", () => {
    expect(evaluateAlerts(vehicle(), weather({ tempC: 35 }), prefs).map((a) => a.type)).toContain("heat");
    expect(evaluateAlerts(vehicle(), weather({ tempC: 34 }), prefs).map((a) => a.type)).not.toContain("heat");
  });

  it("fires hail on storm label or severe wind", () => {
    expect(
      evaluateAlerts(vehicle(), weather({ conditionLabel: "Thunderstorm" }), prefs).map((a) => a.type),
    ).toContain("hail");
    expect(evaluateAlerts(vehicle(), weather({ windSpeedMs: 25 }), prefs).map((a) => a.type)).toContain("hail");
  });

  it("honours per-scenario opt-outs", () => {
    const off: NotificationPreferences = { ...prefs, notifyHeat: false };
    expect(evaluateAlerts(vehicle(), weather({ tempC: 40 }), off)).toEqual([]);
  });
});
