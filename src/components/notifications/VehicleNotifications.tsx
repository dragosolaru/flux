"use client";

import { useVehicleNotifications } from "@/hooks/useVehicleNotifications";
import { useSmartChargeNotifications } from "@/hooks/useSmartChargeNotifications";

interface VehicleNotificationsProps {
  vehicleId: string;
}

export function VehicleNotifications({ vehicleId }: VehicleNotificationsProps) {
  useVehicleNotifications(vehicleId);
  useSmartChargeNotifications(vehicleId);
  return null;
}
