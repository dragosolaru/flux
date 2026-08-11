"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useVehicle } from "@/hooks/useVehicle";

export function useVehicleNotifications(vehicleId: string) {
  // poll: false — this watches for a charging-complete transition in data the
  // screen it renders on is already fetching. refetchInterval is scheduled per
  // observer, not per query, so its own interval kept waking the car straight
  // through the dashboard's "let it sleep".
  const { data } = useVehicle(vehicleId, true, false);
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
