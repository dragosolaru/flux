"use client";

import { useQuery } from "@tanstack/react-query";
import * as costsApi from "@/lib/api/costs";

export function useCosts(vehicleId: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ["costs", vehicleId, from, to],
    queryFn: () => costsApi.get(vehicleId, from, to),
    staleTime: 60_000,
  });
}
