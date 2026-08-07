// Whether a planned route warrants warming the battery.
//
// Lives here because the trip planner exists twice (/trip and the Plan tab on
// /map) and the two had drifted: one checked every stop, the other only the
// first, so a route whose first stop was a Supercharger and whose second was a
// non-Tesla DC charger silently skipped preconditioning on one screen.

import { needsPreconditioning, isSuperchargerNetwork } from "@/components/trip/StopCard";
import type { ChargingStop } from "@/lib/external/routing/types";

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
      needsPreconditioning(s.station.maxKw) && !isSuperchargerNetwork(s.station.networkId),
  );
}
