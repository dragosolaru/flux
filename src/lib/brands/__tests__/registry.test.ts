import { describe, it, expect } from "vitest";
import { BRANDS, BRAND_KEYS, getBrand } from "../registry";
import type { BrandKey } from "../types";

const EXPECTED_BRANDS: BrandKey[] = [
  "tesla",
  "bmw",
  "polestar",
  "mercedes",
  "vw",
  "hyundai",
  "renault",
];

describe("brand registry", () => {
  it("exposes exactly 7 brands", () => {
    expect(BRAND_KEYS).toHaveLength(7);
  });

  it("exposes all expected brand keys", () => {
    expect(BRAND_KEYS.sort()).toEqual(EXPECTED_BRANDS.sort());
  });

  it("each profile key matches its registry key", () => {
    for (const key of BRAND_KEYS) {
      expect(BRANDS[key].key).toBe(key);
    }
  });

  it("each profile has a non-empty displayName", () => {
    for (const key of BRAND_KEYS) {
      expect(BRANDS[key].displayName.length).toBeGreaterThan(0);
    }
  });

  it("each profile has a valid dataSource", () => {
    for (const key of BRAND_KEYS) {
      expect(["mock", "live"]).toContain(BRANDS[key].dataSource);
    }
  });

  it("getBrand returns the correct profile", () => {
    const tesla = getBrand("tesla");
    expect(tesla).not.toBeNull();
    expect(tesla?.key).toBe("tesla");
  });

  it("getBrand returns null for unknown brands", () => {
    expect(getBrand("fiat")).toBeNull();
    expect(getBrand("")).toBeNull();
  });
});

describe("capability map completeness", () => {
  const TELEMETRY_KEYS: (keyof (typeof BRANDS)["tesla"]["capabilities"]["telemetry"])[] = [
    "batteryLevel", "batteryRangeKm", "chargeLimit", "chargingState",
    "chargingRateKw", "timeToFullMinutes", "batteryHealthPct", "cellVoltages",
    "odometer", "speed", "heading", "location",
    "interiorTemp", "exteriorTemp", "climateOn", "driverTempSetting",
    "passengerTempSetting", "hvacMode", "seatHeating", "steeringHeating",
    "locked", "doorsOpen", "windowsOpen", "trunkOpen", "frunkOpen",
    "sentryMode", "dashcam", "softwareVersion", "updateAvailable",
    "tirePressure", "safetyScore", "efficiencyScore",
  ];

  const COMMAND_KEYS: (keyof (typeof BRANDS)["tesla"]["capabilities"]["commands"])[] = [
    "lock", "unlock", "climateOn", "climateOff", "setClimateTemp",
    "honk", "flash", "setChargeLimit", "setChargeAmps",
    "startCharging", "stopCharging", "openChargePort", "closeChargePort",
    "ventWindows", "closeWindows", "activateSentry", "deactivateSentry", "remoteStart",
  ];

  for (const brandKey of EXPECTED_BRANDS) {
    it(`${brandKey}: telemetry map has all expected keys`, () => {
      const caps = BRANDS[brandKey].capabilities.telemetry;
      for (const k of TELEMETRY_KEYS) {
        expect(typeof caps[k]).toBe("boolean");
      }
    });

    it(`${brandKey}: command map has all expected keys`, () => {
      const caps = BRANDS[brandKey].capabilities.commands;
      for (const k of COMMAND_KEYS) {
        expect(typeof caps[k]).toBe("boolean");
      }
    });

    it(`${brandKey}: history capabilities are defined`, () => {
      const h = BRANDS[brandKey].capabilities.history;
      expect(typeof h.chargingSessions).toBe("boolean");
      expect(typeof h.trips).toBe("boolean");
      expect(typeof h.consumption).toBe("boolean");
      expect(typeof h.commandLog).toBe("boolean");
      expect(["unlimited", "90days", "30days", "7days", "none"]).toContain(h.retention);
    });
  }
});

describe("Tesla profile", () => {
  it("has full telemetry coverage", () => {
    const t = BRANDS.tesla.capabilities.telemetry;
    expect(t.batteryLevel).toBe(true);
    expect(t.cellVoltages).toBe(true);
    expect(t.sentryMode).toBe(true);
    expect(t.frunkOpen).toBe(true);
  });

  it("supports all commands", () => {
    const c = BRANDS.tesla.capabilities.commands;
    expect(c.honk).toBe(true);
    expect(c.flash).toBe(true);
    expect(c.remoteStart).toBe(true);
    expect(c.activateSentry).toBe(true);
  });

  it("has unlimited history retention", () => {
    expect(BRANDS.tesla.capabilities.history.retention).toBe("unlimited");
  });
});

describe("Renault profile (most restricted)", () => {
  it("does not expose cell voltages or sentry", () => {
    const t = BRANDS.renault.capabilities.telemetry;
    expect(t.cellVoltages).toBe(false);
    expect(t.sentryMode).toBe(false);
    expect(t.frunkOpen).toBe(false);
  });

  it("does not support honk or flash", () => {
    const c = BRANDS.renault.capabilities.commands;
    expect(c.honk).toBe(false);
    expect(c.flash).toBe(false);
  });

  it("has 7-day history retention", () => {
    expect(BRANDS.renault.capabilities.history.retention).toBe("7days");
  });
});
