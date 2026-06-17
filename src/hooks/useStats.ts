"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { VehicleStatsResponse } from "@/app/api/vehicles/[vehicleId]/stats/route";

export type { VehicleStatsResponse };

export function useStats(vehicleId: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params}` : "";

  return useQuery<VehicleStatsResponse>({
    queryKey: ["stats", vehicleId, from, to],
    queryFn: () => apiFetch<VehicleStatsResponse>(`/api/vehicles/${vehicleId}/stats${qs}`),
    staleTime: 60_000,
    enabled: !!vehicleId,
  });
}
