"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { CostAggregation } from "@/types/costs";

interface CostsResponse extends CostAggregation {
  petrolEquivalentCostRon: number;
  totalKm: number;
}

export function useCosts(vehicleId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ vehicleId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  return useQuery<CostsResponse>({
    queryKey: ["costs", vehicleId, from, to],
    queryFn: () => apiFetch<CostsResponse>(`/api/costs?${params}`),
    staleTime: 60_000,
  });
}
