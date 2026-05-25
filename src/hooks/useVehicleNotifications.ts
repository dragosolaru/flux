"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useVehicle } from "@/hooks/useVehicle";

export function useVehicleNotifications(vehicleId: string) {
  const { data } = useVehicle(vehicleId);
  const prevStateRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      data?.chargingState === "complete" &&
      prevStateRef.current === "charging"
    ) {
      toast.success("Charging complete!", {
        description: `Battery at ${data.batteryLevel ?? "—"}%`,
      });
    }
    prevStateRef.current = data?.chargingState ?? undefined;
  }, [data?.chargingState, data?.batteryLevel]);
}
