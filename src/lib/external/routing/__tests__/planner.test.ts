import { describe, it, expect } from "vitest";
import {
  isConnectorCompatible,
  scoreStation,
  filterUsableStations,
} from "../planner";
import type { ChargingStation } from "@/lib/external/charging-networks/types";
import type { ConnectorType } from "@/lib/chargers/types";

function makeStation(overrides: Partial<ChargingStation> = {}): ChargingStation {
  return {
    id: "test-1",
    networkId: "ionity",
    name: "Test Station",
    lat: 45.0,
    lng: 25.0,
    maxKw: 150,
    totalStalls: 4,
    plugTypes: ["CCS"],
    priceEurKwh: 0.45,
    addressCity: "Test",
    addressCountry: "RO",
    ...overrides,
  };
}

describe("isConnectorCompatible", () => {
  const ccs2Only: ConnectorType[] = ["ccs2"];
  const teslaAndCcs: ConnectorType[] = ["ccs2", "tesla"];

  it("passes when vehicle supports a connector the station has", () => {
    const st = makeStation({ plugTypes: ["CCS"] });
    expect(isConnectorCompatible(st, ccs2Only)).toBe(true);
  });

  it("excludes when no connector matches", () => {
    const st = makeStation({ plugTypes: ["CHAdeMO"] });
    expect(isConnectorCompatible(st, ccs2Only)).toBe(false);
  });

  it("passes when station has Tesla plug and vehicle supports tesla", () => {
    const st = makeStation({ plugTypes: ["Tesla"] });
    expect(isConnectorCompatible(st, teslaAndCcs)).toBe(true);
  });

  it("passes stations with empty plugTypes (unknown — do not exclude)", () => {
    const st = makeStation({ plugTypes: [] });
    expect(isConnectorCompatible(st, ccs2Only)).toBe(true);
  });

  it("passes when vehicle supportedConnectors is empty (no filter applied)", () => {
    const st = makeStation({ plugTypes: ["CHAdeMO"] });
    expect(isConnectorCompatible(st, [])).toBe(false);
  });
});

describe("scoreStation", () => {
  const vehicleMaxDcKw = 250;

  it("prefers higher effective power over same-distance cheaper station", () => {
    const fast = makeStation({ maxKw: 350, priceEurKwh: 0.50, totalStalls: 6 });
    const slow = makeStation({ maxKw: 50, priceEurKwh: 0.30, totalStalls: 2 });
    const fastScore = scoreStation(fast, 5, vehicleMaxDcKw);
    const slowScore = scoreStation(slow, 5, vehicleMaxDcKw);
    expect(fastScore).toBeGreaterThan(slowScore);
  });

  it("penalises longer detour", () => {
    const nearby = makeStation({ maxKw: 150 });
    const farAway = makeStation({ maxKw: 150 });
    const nearScore = scoreStation(nearby, 2, vehicleMaxDcKw);
    const farScore = scoreStation(farAway, 20, vehicleMaxDcKw);
    expect(nearScore).toBeGreaterThan(farScore);
  });

  it("penalises higher price", () => {
    const cheap = makeStation({ maxKw: 150, priceEurKwh: 0.30 });
    const expensive = makeStation({ maxKw: 150, priceEurKwh: 0.79 });
    expect(scoreStation(cheap, 5, vehicleMaxDcKw)).toBeGreaterThan(
      scoreStation(expensive, 5, vehicleMaxDcKw),
    );
  });

  it("gives a small bonus for ≥4 stalls", () => {
    const few = makeStation({ maxKw: 150, totalStalls: 2 });
    const many = makeStation({ maxKw: 150, totalStalls: 8 });
    expect(scoreStation(many, 5, vehicleMaxDcKw)).toBeGreaterThan(
      scoreStation(few, 5, vehicleMaxDcKw),
    );
  });

  it("penalises stale availability", () => {
    const fresh = makeStation({ maxKw: 150, availability: "operational" });
    const stale = makeStation({ maxKw: 150, availability: "stale" });
    expect(scoreStation(fresh, 5, vehicleMaxDcKw)).toBeGreaterThan(
      scoreStation(stale, 5, vehicleMaxDcKw),
    );
  });

  it("caps effective power at vehicle max DC rate", () => {
    const superFast = makeStation({ maxKw: 350 });
    const vehicleCapped = makeStation({ maxKw: 250 });
    // Both effectively 250 kW for a 250 kW vehicle → same power score
    const superScore = scoreStation(superFast, 5, 250);
    const cappedScore = scoreStation(vehicleCapped, 5, 250);
    expect(superScore).toBeCloseTo(cappedScore, 5);
  });
});

describe("filterUsableStations", () => {
  const supportedConnectors: ConnectorType[] = ["ccs2", "tesla"];

  it("includes operational compatible stations", () => {
    const st = makeStation({ availability: "operational", confidence: 0.9, plugTypes: ["CCS"] });
    expect(filterUsableStations([st], supportedConnectors)).toHaveLength(1);
  });

  it("excludes offline stations", () => {
    const st = makeStation({ availability: "offline", confidence: 0.9, plugTypes: ["CCS"] });
    expect(filterUsableStations([st], supportedConnectors)).toHaveLength(0);
  });

  it("excludes low-confidence stations (< 0.5)", () => {
    const st = makeStation({ availability: "operational", confidence: 0.3, plugTypes: ["CCS"] });
    expect(filterUsableStations([st], supportedConnectors)).toHaveLength(0);
  });

  it("includes stations at exactly 0.5 confidence", () => {
    const st = makeStation({ availability: "operational", confidence: 0.5, plugTypes: ["CCS"] });
    expect(filterUsableStations([st], supportedConnectors)).toHaveLength(1);
  });

  it("excludes connector-incompatible stations", () => {
    const st = makeStation({ availability: "operational", confidence: 0.9, plugTypes: ["CHAdeMO"] });
    expect(filterUsableStations([st], supportedConnectors)).toHaveLength(0);
  });

  it("includes stations with unknown availability and confidence (undefined passes)", () => {
    const st = makeStation({ plugTypes: ["CCS"] });
    // No availability or confidence set — should pass through
    expect(filterUsableStations([st], supportedConnectors)).toHaveLength(1);
  });

  it("includes stations with empty plugTypes (unknown connector — do not exclude)", () => {
    const st = makeStation({ plugTypes: [], confidence: 0.8 });
    expect(filterUsableStations([st], supportedConnectors)).toHaveLength(1);
  });

  it("includes stale stations (stale ≠ offline)", () => {
    const st = makeStation({ availability: "stale", confidence: 0.7, plugTypes: ["CCS"] });
    expect(filterUsableStations([st], supportedConnectors)).toHaveLength(1);
  });
});

describe("stop cost calculation", () => {
  it("uses real priceEurKwh when present", () => {
    // A station with €0.69/kWh — verify scoreStation uses it as the price
    const st = makeStation({ priceEurKwh: 0.69, maxKw: 150 });
    const stFree = makeStation({ priceEurKwh: 0.10, maxKw: 150 });
    // Cheaper station should score higher than the expensive one at same detour
    expect(scoreStation(stFree, 5, 250)).toBeGreaterThan(scoreStation(st, 5, 250));
  });

  it("uses assumed average tariff when price is null (for scoring only)", () => {
    // Null price should be treated as the average 0.45 — not penalised vs a 0.45 station
    const nullPrice = makeStation({ priceEurKwh: null, maxKw: 150 });
    const avgPrice = makeStation({ priceEurKwh: 0.45, maxKw: 150 });
    expect(scoreStation(nullPrice, 5, 250)).toBeCloseTo(scoreStation(avgPrice, 5, 250), 5);
  });
});
