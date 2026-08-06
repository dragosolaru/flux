// Real-world OCM duplicate patterns that used to surface as stacked map pins.
// Each case is a shape observed in community-submitted OCM data along the
// Greece → Bulgaria → Romania corridor, where no national registry exists and
// OCM is effectively the only source, so its duplicates reach the map directly.

import { describe, it, expect } from "vitest";
import { matchScore } from "../dedup";
import type { RawCharger, ChargerConnector } from "../types";

const EMPTY_ADDRESS = {
  street: null,
  city: null,
  region: null,
  country: null,
  postcode: null,
};

function raw(
  over: Partial<RawCharger> & { lat: number; lng: number },
): RawCharger {
  return {
    source: "ocm",
    sourceRef: "x",
    name: null,
    operator: null,
    address: EMPTY_ADDRESS,
    connectors: [],
    pricing: null,
    availability: "unknown",
    ...over,
  } as RawCharger;
}

const ccs150: ChargerConnector[] = [{ type: "ccs2", powerKw: 150, count: 2 }];
const type2_22: ChargerConnector[] = [{ type: "type2", powerKw: 22, count: 1 }];

// ~1 degree of latitude = 111_320 m
function latOffset(meters: number): number {
  return meters / 111_320;
}

const KAVALA = { lat: 40.9397, lng: 24.4019 };

describe("OCM duplicate patterns — same site must collapse to one pin", () => {
  it("merges two submissions 30 m apart when connectors agree", () => {
    const a = raw({ ...KAVALA, connectors: ccs150 });
    expect(
      matchScore(a, {
        lat: KAVALA.lat + latOffset(30),
        lng: KAVALA.lng,
        operator: null,
        connectors: ccs150,
        name: null,
      }),
    ).toBeGreaterThanOrEqual(0.6);
  });

  it("merges 30 m apart even when connector data is missing on both sides", () => {
    // OCM compact responses frequently omit Connections for community POIs;
    // before the SAME_SITE_M widening these scored 0.5 and stayed split.
    const a = raw({ ...KAVALA, name: "Public Charging" });
    expect(
      matchScore(a, {
        lat: KAVALA.lat + latOffset(30),
        lng: KAVALA.lng,
        operator: null,
        connectors: [],
        name: "Charging Point",
      }),
    ).toBeGreaterThanOrEqual(0.6);
  });

  it("merges same-coordinate Tesla records named two ways", () => {
    const a = raw({ ...KAVALA, operator: "Tesla", connectors: ccs150 });
    expect(
      matchScore(a, {
        ...KAVALA,
        operator: "Tesla Supercharger",
        connectors: ccs150,
        name: null,
      }),
    ).toBe(1);
  });

  it("merges Shell Recharge written two ways", () => {
    const a = raw({ ...KAVALA, operator: "Shell Recharge", connectors: ccs150 });
    expect(
      matchScore(a, {
        ...KAVALA,
        operator: "Shell",
        connectors: ccs150,
        name: null,
      }),
    ).toBe(1);
  });

  it("keeps a non-Latin operator separate from an unrelated Latin one", () => {
    // Two records that each name an operator are never merged unless the names
    // are demonstrably similar. "ΔΕΗ" and "PPC" ARE the same company, but no
    // string comparison can know that, and treating a non-comparable name as
    // "unknown" would let it absorb any co-located station. Staying split is
    // the safe failure. The mixed-script form ("ΔΕΗ blue" / "PPC blue") does
    // merge, because the Latin remainder is comparable.
    const a = raw({ ...KAVALA, operator: "ΔΕΗ", connectors: ccs150 });
    expect(
      matchScore(a, { ...KAVALA, operator: "PPC", connectors: ccs150, name: null }),
    ).toBe(0);
    expect(
      matchScore(raw({ ...KAVALA, operator: "ΔΕΗ blue", connectors: ccs150 }), {
        ...KAVALA, operator: "PPC blue", connectors: ccs150, name: null,
      }),
    ).toBe(1);
  });

  it("merges operators differing only by a legal/product suffix", () => {
    const a = raw({ ...KAVALA, operator: "Enel X", connectors: ccs150 });
    expect(
      matchScore(a, { ...KAVALA, operator: "Enel X Way", connectors: ccs150, name: null }),
    ).toBe(1);
  });
});

describe("guards — genuinely distinct stations must stay separate", () => {
  it("keeps two different networks at one coordinate apart", () => {
    const a = raw({ ...KAVALA, operator: "Ionity", connectors: ccs150 });
    expect(
      matchScore(a, { ...KAVALA, operator: "Enel X", connectors: ccs150, name: null }),
    ).toBe(0);
  });

  it("does not merge on a short generic operator fragment", () => {
    // "EV" ⊄ "EVBox" — containment requires ≥4 chars on the shorter side.
    const a = raw({ ...KAVALA, operator: "EV", connectors: ccs150 });
    expect(
      matchScore(a, { ...KAVALA, operator: "EVBox Fast", connectors: ccs150, name: null }),
    ).toBe(0);
  });

  it("keeps stations far apart separate regardless of operator", () => {
    const a = raw({ ...KAVALA, operator: "Ionity", connectors: ccs150 });
    expect(
      matchScore(a, {
        lat: KAVALA.lat + latOffset(400),
        lng: KAVALA.lng,
        operator: "Ionity",
        connectors: type2_22,
        name: null,
      }),
    ).toBeLessThan(0.6);
  });
});
