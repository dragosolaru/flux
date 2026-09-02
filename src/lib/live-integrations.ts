// =============================================================================
// LIVE_INTEGRATIONS env flag.
// Comma-separated list of brand keys for which live API calls are enabled.
// Default (empty / unset) = everything runs against the mock simulator.
// Example: LIVE_INTEGRATIONS=tesla,bmw
// =============================================================================

const ENABLED: ReadonlySet<string> = new Set(
  (process.env.LIVE_INTEGRATIONS ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
);

export function isLiveEnabled(brand: string): boolean {
  return ENABLED.has(brand);
}

/**
 * A car stored as live whose brand integration is switched off.
 *
 * This state exists whenever the flag is lowered on a deployment that already
 * has linked cars — which is exactly what happens when the Tesla integration is
 * paused. It needs a name because **the default behaviour for it is dangerous**:
 * every route here is written as `if (isLiveEnabled(brand) && data_source ===
 * "live") { …reach the car… }` and then falls through to the simulator. So a
 * real Tesla with the flag down would land on the mock path, where
 * `/api/vehicles/[id]/state` calls `createInitialSnapshot` and **invents a car**
 * — a fabricated battery level, presented to its owner as their own reading.
 * The commands route is worse: it would apply the command to that invented
 * snapshot and answer "locked" while nothing happened.
 *
 * A paused integration must therefore be answered explicitly, never by the
 * simulator. Simulators belong to vehicles that were created as simulators.
 */
export function isLiveVehicleDormant(vehicle: {
  brand: string;
  data_source: string;
}): boolean {
  return vehicle.data_source === "live" && !isLiveEnabled(vehicle.brand);
}
