"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-fetch";
import type { CapabilityContext } from "@/lib/capabilities";

const EMPTY: CapabilityContext = {
  hasVehicle: false,
  hasLiveVehicle: false,
  hasTariff: false,
  hasCommandsReady: false,
};

export function useCapabilities() {
  return useQuery<CapabilityContext>({
    queryKey: ["me", "capabilities"],
    queryFn: () => apiFetch<CapabilityContext>("/api/me/capabilities"),
    staleTime: 30_000,
    placeholderData: EMPTY,
  });
}
