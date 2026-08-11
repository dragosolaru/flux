"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import * as tariffsApi from "@/lib/api/tariffs";
import { useVehicle } from "@/hooks/useVehicle";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

export function useSmartChargeNotifications(vehicleId: string) {
  // poll: false — this reads chargingState to gate a tariff query and shares a
  // query key with the screen it renders on. TanStack schedules refetchInterval
  // per observer, not per query, so a second polling observer kept fetching
  // (and waking the car) straight through the dashboard's "let it sleep".
  const { data: vehicleState } = useVehicle(vehicleId, true, false);

  const { data: forecast } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => tariffsApi.prices<TariffResponse>(),
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
