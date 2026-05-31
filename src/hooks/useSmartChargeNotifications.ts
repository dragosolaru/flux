"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-fetch";
import { useVehicle } from "@/hooks/useVehicle";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

export function useSmartChargeNotifications(vehicleId: string) {
  const { data: vehicleState } = useVehicle(vehicleId);

  const { data: forecast } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => apiFetch<TariffResponse>("/api/tariffs/prices"),
    staleTime: 5 * 60 * 1000,
    // Only fetch when vehicle is plugged and not already at limit
    enabled:
      !!vehicleId &&
      vehicleState?.chargingState !== "complete" &&
      vehicleState?.chargingState !== null,
  });

  const prevWindowOpenRef = useRef<boolean>(false);

  useEffect(() => {
    if (!forecast) return;

    const currentHour = new Date().getHours();
    const isWindowOpen = currentHour === forecast.cheapestWindowStart;

    if (isWindowOpen && !prevWindowOpenRef.current) {
      const state = vehicleState?.chargingState;
      const shouldNotify =
        state === "stopped" ||
        state === "disconnected" ||
        vehicleState?.motionState === "plugged-idle";

      if (shouldNotify) {
        toast.info("Cheap charging window open", {
          description: "Best time to start charging now",
        });
      }
    }

    prevWindowOpenRef.current = isWindowOpen;
  }, [forecast, vehicleState?.chargingState, vehicleState?.motionState]);
}
