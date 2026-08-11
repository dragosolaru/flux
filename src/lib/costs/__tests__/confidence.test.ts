// Whether a document can ever be marked `done`.
//
// `averageConfidence` decides that against a 0.7 threshold, and the parser used
// to pad a vehicle document's confidence with three hardcoded zeros for fields
// that document type does not have — no kWh, no billing period, no session
// timestamp. A flawless extraction therefore scored (1+0+1+0+0+1)/6 = 0.5 and
// was filed `needs_review`. No car document had ever reached `done`, and the
// vault's calendar export only reads documents that are done, so two features
// were dark at once and neither failed loudly.

import { describe, it, expect } from "vitest";

import { averageConfidence, CONFIDENCE_THRESHOLD } from "../processor";
import type { ParsedDocument } from "@/types/costs";

type Conf = ParsedDocument["confidence"];

describe("averageConfidence", () => {
  it("a perfectly read vehicle document clears the threshold", () => {
    const carDoc: Conf = { document_type: 1, cost_total: 1, valid_until: 1 };
    expect(averageConfidence(carDoc)).toBe(1);
    expect(averageConfidence(carDoc)).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  // The exact shape that used to ship. Kept as a test so the padding cannot
  // come back unnoticed.
  it("padding absent fields with zero would sink it below the threshold", () => {
    const padded = {
      document_type: 1,
      total_kwh: 0,
      cost_total: 1,
      period_start: 0,
      session_timestamp: 0,
      valid_until: 1,
    } as Conf;
    expect(averageConfidence(padded)).toBeCloseTo(0.5);
    expect(averageConfidence(padded)).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it("a genuinely uncertain field still drags the average down", () => {
    expect(averageConfidence({ document_type: 0.9, cost_total: 0.2 } as Conf)).toBeCloseTo(0.55);
  });

  it("an energy document still averages all six", () => {
    const energy: Conf = {
      document_type: 0.9,
      total_kwh: 0.9,
      cost_total: 0.9,
      period_start: 0.9,
      session_timestamp: 0.9,
      valid_until: 0.9,
    };
    expect(averageConfidence(energy)).toBeCloseTo(0.9);
  });

  it("no reported confidence at all is zero, not a pass", () => {
    expect(averageConfidence({} as Conf)).toBe(0);
  });
});
