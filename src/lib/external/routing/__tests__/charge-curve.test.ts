import { describe, it, expect } from "vitest";
import { chargeCurveFraction, chargeMinutes } from "../charge-curve";

describe("chargeCurveFraction", () => {
  it("peaks at low SoC and tapers high", () => {
    expect(chargeCurveFraction(15)).toBeGreaterThan(chargeCurveFraction(60));
    expect(chargeCurveFraction(60)).toBeGreaterThan(chargeCurveFraction(90));
  });

  it("interpolates between curve points and clamps the range", () => {
    expect(chargeCurveFraction(10)).toBeCloseTo(1.0, 5);
    expect(chargeCurveFraction(-20)).toBe(chargeCurveFraction(0));
    expect(chargeCurveFraction(200)).toBe(chargeCurveFraction(100));
  });
});

describe("chargeMinutes", () => {
  it("is slower to fill a high band than the same-width low band", () => {
    const low = chargeMinutes(10, 30, 75, 250, 250);
    const high = chargeMinutes(60, 80, 75, 250, 250);
    expect(high).toBeGreaterThan(low);
  });

  it("treats a slow station as a flat power cap", () => {
    // 50 kW station, 20% of a 75 kWh battery = 15 kWh → ~18 min at a flat 50 kW.
    const mins = chargeMinutes(30, 50, 75, 50, 250);
    expect(mins).toBeGreaterThan(15);
    expect(mins).toBeLessThan(22);
  });

  it("returns 0 for a non-positive range", () => {
    expect(chargeMinutes(80, 80, 75, 250, 250)).toBe(0);
    expect(chargeMinutes(80, 50, 75, 250, 250)).toBe(0);
  });
});
