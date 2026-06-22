"use client";

import { useQuery } from "@tanstack/react-query";

import * as vehiclesApi from "@/lib/api/vehicles";

export function useVehicle(vehicleId: string) {
  return useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.getState(vehicleId),
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: !!vehicleId,
  });
}
