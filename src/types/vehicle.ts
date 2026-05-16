// =============================================================================
// Internal, brand-agnostic vehicle types used by the dashboard UI.
// =============================================================================

import type { TeslaRegion } from "./tesla";

export type VehicleBrand = "tesla";

export interface Vehicle {
  id: string;
  userId: string;
  brand: VehicleBrand;
  displayName: string;
  vin: string | null;
  teslaVehicleId: number | null;
  teslaRegion: TeslaRegion;
  isActive: boolean;
  createdAt: string;
}

export interface VehicleState {
  vehicleId: string;
  displayName: string;
  isOnline: boolean;
  batteryLevel: number;
  batteryRangeKm: number;
  chargeLimit: number;
  chargingState: "disconnected" | "charging" | "complete" | "stopped" | "no_power";
  chargingRateKw: number;
  timeToFullMinutes: number;
  odometerKm: number;
  interiorTempC: number;
  exteriorTempC: number;
  isClimateOn: boolean;
  isLocked: boolean;
  isSentryMode: boolean;
  latitude: number;
  longitude: number;
  recordedAt: string;
}

export interface VehicleSnapshot {
  id: string;
  vehicleId: string;
  batteryLevel: number | null;
  batteryRangeKm: number | null;
  odometerKm: number | null;
  interiorTempC: number | null;
  exteriorTempC: number | null;
  isLocked: boolean | null;
  isCharging: boolean | null;
  chargingRateKw: number | null;
  latitude: number | null;
  longitude: number | null;
  recordedAt: string;
}
