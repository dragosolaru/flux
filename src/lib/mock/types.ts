import type { VehicleState, MotionState } from "@/types/vehicle";
import type { ChargingNetwork } from "@/types/history";

export interface MockVehicleSnapshot {
  state: VehicleState;
  motionState: MotionState;
  scenarioId: string | null;
  lastTickAt: string; // ISO
  // Brand/model-specific vehicle spec — overrides scenario.vehicle during tick
  vehicleSpec: ScenarioVehicle | null;
  // Open session tracking — set when a session starts, cleared on close
  activeChargingSessionStart: string | null;
  activeChargingSessionNetwork: ChargingNetwork | null;
  activeChargingSessionStartSoc: number | null;
  activeTripStart: string | null;
  activeTripStartLat: number | null;
  activeTripStartLng: number | null;
  activeTripStartOdometerKm: number | null;
}

export interface ScenarioLocation {
  lat: number;
  lng: number;
}

export interface ScenarioStep {
  startOffsetSeconds: number;
  motionState: MotionState;
  location: ScenarioLocation;
  targetLocation?: ScenarioLocation;
  avgSpeedKmh?: number;
  chargingRateKw?: number;
  chargingNetwork?: ChargingNetwork;
  climateOn?: boolean;
  driverTempC?: number;
}

export interface ScenarioVehicle {
  batteryCapacityKwh: number;
  efficiencyKwhPer100km: number;
  maxAcChargingRateKw: number;
  maxDcChargingRateKw: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  cycleDurationSeconds: number;
  initialBatteryLevel: number; // 0–100
  vehicle: ScenarioVehicle;
  steps: ScenarioStep[];
}
