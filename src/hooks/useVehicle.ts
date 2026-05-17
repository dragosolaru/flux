"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-fetch";
import type { VehicleState } from "@/types/vehicle";

export function useVehicle(vehicleId: string) {
  return useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => apiFetch<VehicleState>(`/api/vehicles/${vehicleId}/state`),
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: !!vehicleId,
  });
}
