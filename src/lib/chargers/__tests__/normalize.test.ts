import { describe, it, expect } from "vitest";
import {
  canonicalConnectorType,
  parsePowerKw,
  slugifyOperator,
  mergeConnectors,
} from "../normalize";

describe("canonicalConnectorType", () => {
  it("maps OSM socket keys", () => {
    expect(canonicalConnectorType("type2")).toBe("type2");
    expect(canonicalConnectorType("type2_combo")).toBe("ccs2");
    expect(canonicalConnectorType("ccs")).toBe("ccs2");
    expect(canonicalConnectorType("chademo")).toBe("chademo");
    expect(canonicalConnectorType("type1")).toBe("type1");
    expect(canonicalConnectorType("schuko")).toBe("schuko");
    expect(canonicalConnectorType("tesla_supercharger")).toBe("tesla");
  });

  it("maps OCM connection-type titles", () => {
    expect(canonicalConnectorType("CCS (Type 2)")).toBe("ccs2");
    expect(canonicalConnectorType("CCS (Type 1)")).toBe("ccs1");
    expect(canonicalConnectorType("CHAdeMO")).toBe("chademo");
    expect(canonicalConnectorType("Type 2 (Socket Only)")).toBe("type2");
    expect(canonicalConnectorType("Type 1 (J1772)")).toBe("type1");
  });

  it("maps OCM connection-type IDs", () => {
    expect(canonicalConnectorType(32)).toBe("ccs2");
    expect(canonicalConnectorType(2)).toBe("chademo");
    expect(canonicalConnectorType(25)).toBe("type2");
    expect(canonicalConnectorType(30)).toBe("tesla");
  });

  it("falls back to other for unknown input", () => {
    expect(canonicalConnectorType("something weird")).toBe("other");
    expect(canonicalConnectorType(99999)).toBe("other");
  });
});

describe("parsePowerKw", () => {
  it("honors explicit kW unit", () => {
    expect(parsePowerKw("22 kW")).toBe(22);
    expect(parsePowerKw("50 kW")).toBe(50);
  });

  it("honors explicit W unit", () => {
    expect(parsePowerKw("22000 W")).toBe(22);
  });

  it("treats large bare numbers as watts", () => {
    expect(parsePowerKw("150000")).toBe(150);
  });

  it("treats small bare numbers as kW", () => {
    expect(parsePowerKw("22")).toBe(22);
  });

  it("passes numbers through", () => {
    expect(parsePowerKw(50)).toBe(50);
    expect(parsePowerKw(150)).toBe(150);
  });

  it("returns null for null/undefined/garbage", () => {
    expect(parsePowerKw(null)).toBeNull();
    expect(parsePowerKw(undefined)).toBeNull();
    expect(parsePowerKw("n/a")).toBeNull();
  });
});

describe("slugifyOperator", () => {
  it("slugifies plain names", () => {
    expect(slugifyOperator("Some Random CPO")).toBe("some-random-cpo");
  });

  it("applies the alias map", () => {
    expect(slugifyOperator("IONITY GmbH")).toBe("ionity");
    expect(slugifyOperator("Tesla, Inc.")).toBe("tesla");
    expect(slugifyOperator("Enel X")).toBe("enel-x");
  });

  it("returns null for null or empty", () => {
    expect(slugifyOperator(null)).toBeNull();
    expect(slugifyOperator("---")).toBeNull();
  });
});

describe("mergeConnectors", () => {
  it("sums counts for same type+power", () => {
    const merged = mergeConnectors([
      { type: "ccs2", powerKw: 150, count: 1 },
      { type: "ccs2", powerKw: 150, count: 2 },
      { type: "type2", powerKw: 22, count: 1 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((c) => c.type === "ccs2")?.count).toBe(3);
  });
});
