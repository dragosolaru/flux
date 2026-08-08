// Whether a planned route warrants warming the battery.
//
// Extracted when the planner existed on two screens that had drifted: one
// checked every stop, the other only the first, so a route whose first stop was
// a Supercharger and whose second was a non-Tesla DC charger silently skipped
// preconditioning. The screens are now one; the rule stays here as the single
// definition of when warming the battery is warranted.

import type { ChargingStop } from "@/lib/external/routing/types";

/**
 * Below this, warming the battery buys nothing worth the energy.
 *
 * Was declared twice — here via StopCard, and again in ChargerDetailSheet —
 * with the constant duplicated and, worse, two different tests for "is this
 * Tesla's own network". A rule with two definitions has none.
 */
const PRECONDITION_MIN_KW = 50;

export function needsPreconditioning(maxKw: number): boolean {
  return maxKw >= PRECONDITION_MIN_KW;
}

/**
 * True for Tesla's own network, which warms the battery from the car's
 * navigation and needs no command from us.
 *
 * Accepts both signals because the two callers had one each and disagreed:
 * the trip planner tested `networkId === "tesla-sc"`, the charger sheet tested
 * `operatorId === "tesla"`. The same forecourt could therefore be preconditioned
 * from one screen and not the other. Either identifying it is enough.
 */
export function isTeslaOwnNetwork(input: {
  networkId?: string | null;
  operatorId?: string | null;
}): boolean {
  return input.networkId === "tesla-sc" || input.operatorId === "tesla";
}

/**
 * True when ANY stop is a DC charger Tesla will not precondition for by itself.
 *
 * Superchargers are excluded: the car warms the battery from its own navigation
 * when routed to one, so asking again is redundant. Every stop counts, not just
 * the first — the cold-battery arrival we are avoiding can be the third one.
 */
export function routeNeedsPreconditioning(stops: ChargingStop[]): boolean {
  return stops.some(
    (s) =>
      needsPreconditioning(s.station.maxKw) &&
      !isTeslaOwnNetwork({ networkId: s.station.networkId }),
  );
}
