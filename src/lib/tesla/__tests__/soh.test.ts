import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * State of health, and the baseline it is measured against.
 *
 * Reported from the car: the app said 85.4% while the dash showed 451 km at a
 * full charge. 451 km is 280 miles, and 280/330 is 84.9% — so the estimate had
 * been divided by 330, the generic default, rather than by any Model 3 figure.
 *
 * The cause is one character. Position 4 of a Tesla VIN is the model line —
 * `3`, `S`, `X`, `Y` — and the table keyed Model 3 on `F`, which is not a Tesla
 * model code at all. Every Model 3 ever linked missed the table and was scored
 * against a baseline belonging to no car in particular.
 */
const api = readFileSync(join(process.cwd(), "src/lib/tesla/api.ts"), "utf8");

describe("rated-range table", () => {
  it("keys Model 3 on the character Tesla actually uses", () => {
    expect(api).toMatch(/"3":\s*\d+/);
    // `F` is not a model code, and its presence is what sent every Model 3 to
    // the default.
    expect(api).not.toMatch(/^\s*F:\s*\d+,/m);
  });

  it("covers the four model lines and nothing invented", () => {
    for (const key of ['"3"', "Y:", "S:", "X:"]) {
      expect(api).toContain(key);
    }
  });
});

describe("what it does when it cannot know", () => {
  it("returns no percentage rather than one measured against an average", () => {
    // A Model 3 RWD, Long Range and Performance leave the factory at roughly
    // 272, 358 and 315 rated miles. Dividing one car's measurement by another
    // variant's baseline is wrong by a quarter, confidently. The default was
    // exactly that, so it is gone.
    expect(api).not.toContain("DEFAULT_RATED_RANGE_MILES");
    expect(api).toMatch(/if \(ratedRange == null\) \{[\s\S]*?pct: null/);
  });

  it("always returns the measurement, which a driver can check", () => {
    // Range at 100% can be compared with the car's own screen in one glance.
    // A percentage against a guessed baseline cannot be checked at all.
    expect(api).toMatch(/fullRangeKm:/);
    expect(api).toMatch(/baselineKm:/);
  });

  it("refuses to estimate from a nearly-empty pack", () => {
    // Below 15% the car's range figure is dominated by its own reserve
    // modelling and stops being a proxy for capacity.
    expect(api).toMatch(/if \(soc <= 15\) return null;/);
  });
});
