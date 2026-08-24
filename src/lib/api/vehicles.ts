import { apiFetch } from "@/lib/api-fetch";
import type { CommandName } from "@/types/history";
import type { VehicleState } from "@/types/vehicle";
import type { VehicleStatsResponse } from "@/types/stats";
import type { VehicleListItem } from "@/hooks/useVehicles";

const BASE = "/api/vehicles";

export interface VehicleUpdatePayload {
  is_active?: boolean;
  virtualKeyPaired?: boolean;
  scenarioId?: string;
  nickname?: string;
}

export interface NavPoint {
  lat: number;
  lng: number;
  name: string;
}

export interface ChargingHistorySyncResult {
  synced: number;
  total: number;
}

export function list<T = VehicleListItem>(includeInactive = false): Promise<T[]> {
  return apiFetch<T[]>(includeInactive ? `${BASE}?include_inactive=true` : BASE);
}

export function getState(vehicleId: string): Promise<VehicleState> {
  return apiFetch<VehicleState>(`${BASE}/${vehicleId}/state`);
}

export function getStats(
  vehicleId: string,
  from?: string,
  to?: string,
): Promise<VehicleStatsResponse> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<VehicleStatsResponse>(`${BASE}/${vehicleId}/stats${qs}`);
}

export function getBatteryHealth<T>(vehicleId: string): Promise<T[]> {
  return apiFetch<T[]>(`${BASE}/${vehicleId}/battery-health`);
}

export function update(
  vehicleId: string,
  payload: VehicleUpdatePayload,
): Promise<unknown> {
  return apiFetch(`${BASE}/${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function remove(vehicleId: string): Promise<unknown> {
  return apiFetch(`${BASE}/${vehicleId}`, { method: "DELETE" });
}

export function sendCommand(
  vehicleId: string,
  command: CommandName,
  args?: Record<string, unknown>,
): Promise<{ success?: boolean; result?: string }> {
  return apiFetch(`${BASE}/${vehicleId}/commands`, {
    method: "POST",
    body: JSON.stringify(args ? { command, args } : { command }),
  });
}

/**
 * Wake the car. The ONLY call in the app that may pull it out of sleep — every
 * read passes allowWake:false server-side — so it belongs behind a deliberate
 * tap and nothing else.
 */
export function wake(vehicleId: string): Promise<VehicleState> {
  return apiFetch<VehicleState>(`${BASE}/${vehicleId}/wake`, { method: "POST" });
}

export function getChargingHistory<T>(vehicleId: string): Promise<T[]> {
  return apiFetch<T[]>(`${BASE}/${vehicleId}/charging-history`);
}

export function syncChargingHistory(
  vehicleId: string,
): Promise<ChargingHistorySyncResult> {
  return apiFetch<ChargingHistorySyncResult>(
    `${BASE}/${vehicleId}/charging-history`,
    { method: "POST" },
  );
}

/**
 * Send a destination (and any planned stops) to the car's navigation, and
 * trigger battery preconditioning in parallel when the next fast charger needs
 * it. Tesla auto-preconditions for its own Superchargers, so callers pass
 * `precondition: true` only for third-party fast chargers. This unifies the
 * share-to-Tesla flow used by the charging map, trip planner and unified map.
 */
export async function shareNavigation(
  vehicleId: string,
  nav: { destination: NavPoint; stops?: NavPoint[] },
  opts: { precondition: boolean },
): Promise<void> {
  const args: Record<string, unknown> = { destination: nav.destination };
  if (nav.stops) args.stops = nav.stops;
  await Promise.all([
    sendCommand(vehicleId, "share_navigation", args),
    opts.precondition
      ? sendCommand(vehicleId, "precondition_max", { on: true })
      : Promise.resolve(),
  ]);
}
