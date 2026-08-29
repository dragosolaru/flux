import { describe, expect, it } from "vitest";
import { batteryChemistry, chemistryForBadge, estimateSoH, trimKey } from "../api";

/**
 * State of health, and the baseline it is measured against.
 *
 * Reported from the car: the app said 85.4% while the dash showed 451 km at a
 * full charge. 451 km is 280 miles, and 280/330 is 84.9% — so the estimate had
 * been divided by 330, a generic default, rather than by any Model 3 figure.
 * The table keyed Model 3 on `F`, which is not a Tesla model code at all, so
 * every Model 3 ever linked missed it and was scored against a car that does
 * not exist.
 *
 * The baseline now comes from the car's own badge. These tests exercise the
 * function rather than reading the file, because the previous version of them
 * asserted on source text and would have passed with the arithmetic wrong.
 */

const M3P = { car_type: "model3", trim_badging: "p74d" };
const M3LR = { car_type: "model3", trim_badging: "74d" };

describe("estimateSoH", () => {
  it("scales the reading to a full charge", () => {
    // 157.5 rated miles at 50% is a 315-mile pack: a healthy Performance.
    const soh = estimateSoH({ battery_level: 50, battery_range: 157.5 }, M3P);
    expect(soh?.pct).toBe(100);
    expect(soh?.fullRangeKm).toBe(507);
  });

  it("gives the Performance its own baseline, not the Long Range one", () => {
    // The same car against 358 miles reads 78% — a pack that looks worn out.
    // This is the failure the driver caught, in the other direction.
    const perf = estimateSoH({ battery_level: 100, battery_range: 280 }, M3P);
    const lr = estimateSoH({ battery_level: 100, battery_range: 280 }, M3LR);
    expect(perf?.pct).toBe(88.9);
    expect(lr?.pct).toBe(78.2);
  });

  it("returns the measurement and no percentage for a badge it does not know", () => {
    const soh = estimateSoH(
      { battery_level: 80, battery_range: 240 },
      { car_type: "modely", trim_badging: "p74d" },
    );
    expect(soh?.fullRangeKm).toBe(483);
    expect(soh?.pct).toBeNull();
    expect(soh?.baselineKm).toBeNull();
  });

  it("says what it measured against, so the claim can be argued with", () => {
    expect(estimateSoH({ battery_level: 60, battery_range: 189 }, M3P)?.baselineKm).toBe(507);
  });

  it("refuses to estimate from a nearly-empty pack", () => {
    // Below 15% the car's range figure is dominated by its own reserve
    // modelling and stops being a proxy for capacity.
    expect(estimateSoH({ battery_level: 12, battery_range: 38 }, M3P)).toBeNull();
  });

  it("returns nothing when the car did not send a charge state", () => {
    expect(estimateSoH(null, M3P)).toBeNull();
    expect(estimateSoH({ battery_level: 80 }, M3P)).toBeNull();
  });
});

describe("batteryChemistry", () => {
  it("reads the chemistry off the badge", () => {
    expect(batteryChemistry(M3P)).toBe("nmc");
    expect(batteryChemistry(M3LR)).toBe("nmc");
  });

  it("is null for a badge we have not mapped", () => {
    // Load-bearing null. NMC wants 50–80% daily and dislikes sitting full; LFP
    // wants 100% regularly. Advice for the wrong one is not vague, it is
    // backwards, so an unmapped car gets no advice at all.
    expect(batteryChemistry({ car_type: "model3", trim_badging: "50" })).toBeNull();
    expect(batteryChemistry({ car_type: "modely", trim_badging: "74d" })).toBeNull();
    expect(batteryChemistry(null)).toBeNull();
    expect(batteryChemistry({})).toBeNull();
  });
});

describe("chemistryForBadge", () => {
  it("answers from a stored badge, so a sleeping car still knows what it is", () => {
    // A parked Tesla is asleep most of the day and is answered from storage.
    // Without this the advice appeared only in the minutes the car was awake,
    // which looks like a broken feature rather than a sleeping car.
    expect(chemistryForBadge("model3:p74d")).toBe("nmc");
  });

  it("is null for a badge we have not mapped, and for no badge at all", () => {
    expect(chemistryForBadge("model3:xyz")).toBeNull();
    expect(chemistryForBadge(null)).toBeNull();
    expect(chemistryForBadge("")).toBeNull();
  });

  it("agrees with the live path, because both read the same table", () => {
    expect(chemistryForBadge(trimKey(M3P))).toBe(batteryChemistry(M3P));
  });
});

describe("trimKey", () => {
  it("keys on the model as well as the badge", () => {
    // A Model Y reporting p74d must not borrow a Model 3 figure.
    expect(trimKey(M3P)).toBe("model3:p74d");
    expect(trimKey({ car_type: "modely", trim_badging: "P74D" })).toBe("modely:p74d");
  });

  it("survives a half-asleep response with no config at all", () => {
    expect(trimKey(null)).toBe(":");
    expect(trimKey({ car_type: "model3" })).toBe("model3:");
  });
});
