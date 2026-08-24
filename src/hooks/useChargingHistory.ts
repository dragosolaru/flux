"use client";

import { useQuery } from "@tanstack/react-query";

import * as vehiclesApi from "@/lib/api/vehicles";

export interface ChargingSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_added_kwh: number | null;
  start_soc: number | null;
  end_soc: number | null;
  network: string | null;
  cost_eur: number | null;
  cost_ron: number | null;
  max_charging_rate_kw: number | null;
  location_name: string | null;
}

/**
 * Charging sessions for the vehicle currently selected — not for whichever car
 * happens to be oldest.
 *
 * `/charging` used to render server-fetched history for the first vehicle by
 * `created_at` beside live state for the selected one, so with two cars linked
 * the list belonged to a different car than the battery above it. Keying the
 * query on the vehicle makes that class of mismatch impossible rather than
 * merely fixed once.
 */
export function useChargingHistory(vehicleId: string, initialData?: ChargingSessionRow[]) {
  return useQuery({
    queryKey: ["charging-history", vehicleId],
    queryFn: () => vehiclesApi.getChargingHistory<ChargingSessionRow>(vehicleId),
    enabled: vehicleId !== "",
    staleTime: 60_000,
    initialData,
  });
}
