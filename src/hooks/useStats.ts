"use client";

import { useQuery } from "@tanstack/react-query";
import * as vehiclesApi from "@/lib/api/vehicles";
import type { VehicleStatsResponse } from "@/types/stats";

export type { VehicleStatsResponse };

export function useStats(vehicleId: string, from?: string, to?: string) {
  return useQuery<VehicleStatsResponse>({
    queryKey: ["stats", vehicleId, from, to],
    queryFn: () => vehiclesApi.getStats(vehicleId, from, to),
    staleTime: 60_000,
    enabled: !!vehicleId,
  });
}
