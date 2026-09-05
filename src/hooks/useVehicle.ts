"use client";

import { useQuery } from "@tanstack/react-query";

import * as vehiclesApi from "@/lib/api/vehicles";
import type { VehicleState } from "@/types/vehicle";

/**
 * Every cache entry for one vehicle's state.
 *
 * There used to be two — a live read and a cached-only one — and anything that
 * wrote to the cache had to reach both. Exported because `useVehicleCommand`
 * wrote to `["vehicle", id]` while this hook read `["vehicle", id, "live"]`, so
 * every optimistic update landed in an entry no screen was watching: a lock
 * command left the row saying LOCKED until something else happened to refetch.
 * The second entry is gone with the live integration; the prefix stays as the
 * single place the key is built.
 */
export function vehicleQueryPrefix(vehicleId: string): readonly [string, string] {
  return ["vehicle", vehicleId] as const;
}

/** How often a screen that is allowed to poll asks again. */
export const POLL_INTERVAL_MS = 30_000;

/**
 * Whether a poll is allowed right now.
 *
 * **This used to be about battery, and is now only about pointlessness.** A
 * poll on a sleeping Tesla woke it, and a car kept from deep sleep lost roughly
 * ten times more charge per idle day — so the rule was "no by default", with an
 * app-wide sleep switch, a ten-minute idle cut-off and a `live` flag marking
 * the vehicles that could be disturbed. All of that machinery protected a car
 * this app no longer contacts.
 *
 * What is left is the simulator, which is our own database, and vehicles with
 * no telemetry at all, which return the same empty answer every time. So the
 * rule collapses to: refresh if the screen asked, and stop after a failure
 * rather than retrying every thirty seconds forever.
 */
export function pollInterval(input: {
  /** The screen asked to keep refreshing. */
  poll: boolean;
  status: "pending" | "success" | "error";
}): number | false {
  if (!input.poll) return false;
  if (input.status === "error") return false;
  return POLL_INTERVAL_MS;
}

/**
 * @param hasTelemetry  false for a vehicle that is a record rather than a
 *                      simulator — nothing about it changes, so there is
 *                      nothing to poll for. Passing true for such a car is not
 *                      harmful, only wasteful.
 * @param poll          keep refreshing. Screens that need the current value
 *                      once — the trip planner reading the battery to plan
 *                      from — pass false.
 *
 *                      A predicate may be passed instead, evaluated against the
 *                      last state reported. That is how a screen can refresh
 *                      only while something is happening, without the
 *                      chicken-and-egg of needing the data to decide whether to
 *                      fetch the data.
 */
export function useVehicle(
  vehicleId: string,
  hasTelemetry = true,
  poll: boolean | ((state: VehicleState | undefined) => boolean) = true,
) {
  return useQuery({
    queryKey: vehicleQueryPrefix(vehicleId),
    queryFn: () => vehiclesApi.getState(vehicleId, false),
    refetchInterval: (q) =>
      pollInterval({
        poll:
          hasTelemetry && (typeof poll === "function" ? poll(q.state.data) : poll),
        status: q.state.status,
      }),
    staleTime: 20_000,
    enabled: !!vehicleId,
  });
}
