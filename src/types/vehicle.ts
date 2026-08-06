// =============================================================================
// Internal, brand-agnostic vehicle types used by the dashboard UI.
// VehicleState is a superset of all OEM telemetry categories. Fields a brand
// does not provide are null; UI components hide null fields rather than
// substituting placeholder values.
// =============================================================================

import type { TeslaRegion } from "./tesla";
import type { BrandKey } from "@/lib/brands/types";

export type VehicleBrand = BrandKey;
export type DataSource = "mock" | "live";

// ---------------------------------------------------------------------------
// Vehicle row (DB-backed, identity + metadata)
// ---------------------------------------------------------------------------

export interface Vehicle {
  id: string;
  userId: string;
  brand: VehicleBrand;
  displayName: string;
  nickname: string | null;
  vin: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  color: string | null;
  photoUrl: string | null;
  dataSource: DataSource;
  // Tesla-specific (kept for live Tesla adapter; null for other brands)
  teslaVehicleId: number | null;
  teslaRegion: TeslaRegion | null;
  isActive: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// VehicleState — superset of all OEM telemetry, returned by all adapters
// ---------------------------------------------------------------------------

export type ChargingState =
  | "disconnected"
  | "charging"
  | "complete"
  | "stopped"
  | "no_power";

export type MotionState = "parked" | "driving" | "charging" | "plugged-idle";

export interface TirePressures {
  frontLeftKpa: number;
  frontRightKpa: number;
  rearLeftKpa: number;
  rearRightKpa: number;
}

export interface DoorsState {
  frontLeft: boolean;
  frontRight: boolean;
  rearLeft: boolean;
  rearRight: boolean;
}

export interface WindowsState {
  frontLeft: boolean;
  frontRight: boolean;
  rearLeft: boolean;
  rearRight: boolean;
}

export interface VehicleState {
  // --- identity -------------------------------------------------------
  vehicleId: string;
  displayName: string;
  brand: VehicleBrand;
  dataSource: DataSource;

  // --- connectivity ---------------------------------------------------
  isOnline: boolean;
  lastSeenAt: string | null;

  // --- energy / battery -----------------------------------------------
  batteryLevel: number | null;        // 0–100 %
  batteryRangeKm: number | null;
  chargeLimit: number | null;         // 0–100 %
  chargingState: ChargingState | null;
  chargingRateKw: number | null;
  timeToFullMinutes: number | null;
  // Scheduled charging — start time persisted so the UI reflects a saved schedule.
  scheduledChargingEnabled: boolean | null;
  scheduledChargingStartMinutes: number | null; // minutes after local midnight
  batteryHealthPct: number | null;    // SoH 0–100 %
  cellVoltages: number[] | null;      // per-cell volts (Tesla only)

  // --- drive / motion -------------------------------------------------
  motionState: MotionState | null;
  odometerKm: number | null;
  speedKmh: number | null;
  headingDeg: number | null;

  // --- location -------------------------------------------------------
  latitude: number | null;
  longitude: number | null;

  // --- climate / cabin ------------------------------------------------
  interiorTempC: number | null;
  exteriorTempC: number | null;
  isClimateOn: boolean | null;
  driverTempC: number | null;
  passengerTempC: number | null;
  hvacMode: string | null;            // e.g. "heat", "cool", "auto"
  seatHeatingLevel: number | null;    // 0–3
  steeringHeating: boolean | null;

  // --- body / security ------------------------------------------------
  isLocked: boolean | null;
  doorsOpen: DoorsState | null;
  windowsOpen: WindowsState | null;
  isTrunkOpen: boolean | null;
  isFrunkOpen: boolean | null;
  isSentryMode: boolean | null;
  isDashcamRecording: boolean | null;
  isBatteryPreconditioning: boolean | null;

  // --- software / health ----------------------------------------------
  softwareVersion: string | null;
  updateAvailable: boolean | null;
  updateVersionLabel: string | null;
  serviceDueAt: string | null;        // ISO date

  // --- tyre pressure --------------------------------------------------
  tirePressures: TirePressures | null;

  // --- efficiency / scores --------------------------------------------
  safetyScore: number | null;         // 0–100
  efficiencyScore: number | null;     // 0–100

  // --- metadata -------------------------------------------------------
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// VehicleSnapshot — polling history for live vehicles (kept for live adapters)
// ---------------------------------------------------------------------------

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
