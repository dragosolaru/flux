"use client";

import { useQuery } from "@tanstack/react-query";
import * as vehiclesApi from "@/lib/api/vehicles";

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
    queryFn: () => vehiclesApi.list(),
    staleTime: 60_000,
  });
}
