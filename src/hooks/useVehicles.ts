"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

export interface VehicleListItem {
  id: string;
  brand: string;
  displayName: string;
  nickname: string | null;
  model: string | null;
  year: number | null;
  dataSource: "mock" | "live";
  virtualKeyPaired: boolean;
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: () => apiFetch<VehicleListItem[]>("/api/vehicles"),
    staleTime: 60_000,
  });
}
