// docs/FEATURES.md claimed these helpers were unit tested. They were not —
// src/lib/trip/__tests__/ held only share-route.test.ts. An audit caught the
// claim; this is the test it described.

import { describe, it, expect } from "vitest";

import {
  needsPreconditioning,
  isTeslaOwnNetwork,
  routeNeedsPreconditioning,
} from "../precondition";
import type { ChargingStop } from "@/lib/external/routing/types";

function stop(over: {
  maxKw: number;
  networkId?: string;
  operatorId?: string;
}): ChargingStop {
  return {
    station: {
      id: "s1",
      name: "Station",
      lat: 40.8,
      lng: 23.8,
      maxKw: over.maxKw,
      networkId: over.networkId ?? "other",
      operatorId: over.operatorId,
      plugTypes: [],
      priceEurKwh: null,
      availability: "unknown",
      confidence: 0.8,
      stalls: 2,
    } as unknown as ChargingStop["station"],
    arriveSoc: 20,
    departSoc: 80,
    energyAddedKwh: 45,
    chargingMinutes: 25,
    costEur: 18,
    distanceFromStartKm: 300,
    drivingMinutesFromStart: 180,
    etaMinutesFromStart: 180,
  };
}

describe("needsPreconditioning", () => {
  it("is worth it from 50 kW up", () => {
    expect(needsPreconditioning(50)).toBe(true);
    expect(needsPreconditioning(150)).toBe(true);
  });

  it("is not worth it below 50 kW", () => {
    // Warming the battery for an AC stop costs more than it saves.
    expect(needsPreconditioning(49)).toBe(false);
    expect(needsPreconditioning(22)).toBe(false);
    expect(needsPreconditioning(0)).toBe(false);
  });
});

describe("isTeslaOwnNetwork", () => {
  // The two callers each used one of these fields and disagreed: the planner
  // tested networkId, the charger sheet tested operatorId. The same forecourt
  // was preconditioned from one screen and not the other.
  it("recognises the network id the planner carries", () => {
    expect(isTeslaOwnNetwork({ networkId: "tesla-sc" })).toBe(true);
  });

  it("recognises the operator id the charger sheet carries", () => {
    expect(isTeslaOwnNetwork({ operatorId: "tesla" })).toBe(true);
  });

  it("is false for everything else, including missing fields", () => {
    expect(isTeslaOwnNetwork({ networkId: "ionity" })).toBe(false);
    expect(isTeslaOwnNetwork({ operatorId: "shell" })).toBe(false);
    expect(isTeslaOwnNetwork({})).toBe(false);
    expect(isTeslaOwnNetwork({ networkId: null, operatorId: null })).toBe(false);
  });
});

describe("routeNeedsPreconditioning", () => {
  it("is false for a route with no stops", () => {
    expect(routeNeedsPreconditioning([])).toBe(false);
  });

  it("is false when every stop is a Supercharger", () => {
    // The car warms itself when routed to Tesla's own network; asking again is
    // redundant.
    expect(
      routeNeedsPreconditioning([
        stop({ maxKw: 250, networkId: "tesla-sc" }),
        stop({ maxKw: 150, networkId: "tesla-sc" }),
      ]),
    ).toBe(false);
  });

  it("is false when every stop is slow AC", () => {
    expect(routeNeedsPreconditioning([stop({ maxKw: 22 }), stop({ maxKw: 11 })])).toBe(false);
  });

  it("is true for a single non-Tesla DC stop", () => {
    expect(routeNeedsPreconditioning([stop({ maxKw: 150, networkId: "ionity" })])).toBe(true);
  });

  it("checks EVERY stop, not just the first", () => {
    // This is the whole reason the helper exists. /map decided from the first
    // stop alone while /trip checked all of them, so a route starting at a
    // Supercharger arrived cold at the next third-party fast charger.
    expect(
      routeNeedsPreconditioning([
        stop({ maxKw: 250, networkId: "tesla-sc" }),
        stop({ maxKw: 150, networkId: "ionity" }),
      ]),
    ).toBe(true);
  });

  it("ignores a slow stop that happens to be third-party", () => {
    expect(
      routeNeedsPreconditioning([
        stop({ maxKw: 250, networkId: "tesla-sc" }),
        stop({ maxKw: 22, networkId: "ionity" }),
      ]),
    ).toBe(false);
  });
});
