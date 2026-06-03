import { describe, it, expect } from "vitest";
import { computeConfidence } from "../confidence";

const bare = {
  hasOperator: false,
  hasPoweredConnector: false,
  hasAddress: false,
  conflict: false,
};

describe("computeConfidence", () => {
  it("bases score on independent-source agreement", () => {
    expect(computeConfidence({ ...bare, sourceCount: 1 })).toBe(0.5);
    expect(computeConfidence({ ...bare, sourceCount: 2 })).toBe(0.75);
    expect(computeConfidence({ ...bare, sourceCount: 3 })).toBe(0.9);
    expect(computeConfidence({ ...bare, sourceCount: 5 })).toBe(0.9);
  });

  it("treats zero/unknown source count as the single-source base", () => {
    expect(computeConfidence({ ...bare, sourceCount: 0 })).toBe(0.5);
  });

  it("adds completeness bonuses", () => {
    expect(
      computeConfidence({ ...bare, sourceCount: 1, hasOperator: true }),
    ).toBe(0.53);
    expect(
      computeConfidence({ ...bare, sourceCount: 1, hasPoweredConnector: true }),
    ).toBe(0.54);
    expect(
      computeConfidence({ ...bare, sourceCount: 1, hasAddress: true }),
    ).toBe(0.53);
    expect(
      computeConfidence({
        sourceCount: 1,
        hasOperator: true,
        hasPoweredConnector: true,
        hasAddress: true,
        conflict: false,
      }),
    ).toBe(0.6);
  });

  it("applies the conflict penalty", () => {
    expect(
      computeConfidence({ ...bare, sourceCount: 2, conflict: true }),
    ).toBe(0.6);
  });

  it("clamps to [0, 1]", () => {
    const high = computeConfidence({
      sourceCount: 3,
      hasOperator: true,
      hasPoweredConnector: true,
      hasAddress: true,
      conflict: false,
    });
    expect(high).toBe(1);

    const low = computeConfidence({
      sourceCount: 1,
      hasOperator: false,
      hasPoweredConnector: false,
      hasAddress: false,
      conflict: true,
    });
    expect(low).toBe(0.35);
    expect(low).toBeGreaterThanOrEqual(0);
  });

  it("rounds to 2 decimals", () => {
    const score = computeConfidence({ ...bare, sourceCount: 1, hasOperator: true });
    expect(score).toBe(Math.round(score * 100) / 100);
  });
});
