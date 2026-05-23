// Creates the initial MockVehicleSnapshot for a newly added mock vehicle.

import type { BrandKey } from "@/lib/brands/types";
import type { MockVehicleSnapshot } from "./types";
import { getScenario, getStepInfoAt } from "./scenarios";
import { getModelSpec } from "@/lib/brands/models";
import type { VehicleState } from "@/types/vehicle";

// Brand-specific version strings for software card
const SOFTWARE_VERSIONS: Record<BrandKey, string> = {
  tesla: "2025.14.3",
};

// Stable mock tire pressures (kPa) — ~35 psi nominal, slight rear increase for load
const NOMINAL_TIRE_PRESSURES = {
  frontLeftKpa:  241,
  frontRightKpa: 241,
  rearLeftKpa:   248,
  rearRightKpa:  248,
};

// 96-cell pack at ~3.7 V each, slight variance to look realistic
function makeCellVoltages(): number[] {
  return Array.from({ length: 96 }, (_, i) => {
    const jitter = ((i * 7) % 17) * 0.001; // deterministic, 0–16 mV spread
    return 3.680 + jitter;
  });
}

export function createInitialSnapshot(
  vehicleId: string,
  displayName: string,
  brand: BrandKey,
  scenarioId: string,
  modelName?: string | null,
): MockVehicleSnapshot {
  const scenario = getScenario(scenarioId) ?? getScenario("commuter")!;
  const spec = getModelSpec(brand, modelName ?? null);
  const now = new Date();
  const { step } = getStepInfoAt(scenario, now);

  const maxRangeKm = (spec.batteryCapacityKwh / spec.efficiencyKwhPer100km) * 100;
  const initialBattery = scenario.initialBatteryLevel;

  const state: VehicleState = {
    vehicleId,
    displayName,
    brand,
    dataSource: "mock",
    isOnline: true,
    lastSeenAt: now.toISOString(),
    batteryLevel: initialBattery,
    batteryRangeKm: (initialBattery / 100) * maxRangeKm,
    chargeLimit: spec.defaultChargeLimit,
    chargingState: "disconnected",
    chargingRateKw: null,
    timeToFullMinutes: null,
    // Static telemetry — capability mask nulls these for brands that don't expose them
    batteryHealthPct: 92.4,
    cellVoltages: makeCellVoltages(),
    motionState: step.motionState,
    odometerKm: 0,
    speedKmh: null,
    headingDeg: null,
    latitude: step.location.lat,
    longitude: step.location.lng,
    interiorTempC: 20,
    exteriorTempC: 15,
    isClimateOn: step.climateOn ?? false,
    driverTempC: step.driverTempC ?? null,
    passengerTempC: null,
    hvacMode: null,
    seatHeatingLevel: null,
    steeringHeating: null,
    isLocked: true,
    doorsOpen: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
    windowsOpen: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
    isTrunkOpen: false,
    isFrunkOpen: false,
    isSentryMode: false,
    isDashcamRecording: false,
    softwareVersion: SOFTWARE_VERSIONS[brand],
    updateAvailable: false,
    updateVersionLabel: null,
    serviceDueAt: null,
    tirePressures: NOMINAL_TIRE_PRESSURES,
    safetyScore: 95,
    efficiencyScore: 82,
    recordedAt: now.toISOString(),
  };

  return {
    state,
    motionState: step.motionState,
    scenarioId,
    lastTickAt: now.toISOString(),
    vehicleSpec: {
      batteryCapacityKwh: spec.batteryCapacityKwh,
      efficiencyKwhPer100km: spec.efficiencyKwhPer100km,
      maxAcChargingRateKw: spec.maxAcChargingRateKw,
      maxDcChargingRateKw: spec.maxDcChargingRateKw,
    },
    activeChargingSessionStart: null,
    activeChargingSessionNetwork: null,
    activeChargingSessionStartSoc: null,
    activeTripStart: null,
    activeTripStartLat: null,
    activeTripStartLng: null,
    activeTripStartOdometerKm: null,
  };
}
