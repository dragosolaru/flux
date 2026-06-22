"use client";

import { useQuery } from "@tanstack/react-query";

import * as meApi from "@/lib/api/me";
import type { CapabilityContext } from "@/lib/capabilities";

const EMPTY: CapabilityContext = {
  hasVehicle: false,
  hasLiveVehicle: false,
  hasTariff: false,
  hasCommandsReady: false,
  hasProSubscription: false,
};

export function useCapabilities() {
  return useQuery<CapabilityContext>({
    queryKey: ["me", "capabilities"],
    queryFn: () => meApi.capabilities(),
    staleTime: 30_000,
    placeholderData: EMPTY,
  });
}
