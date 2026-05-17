// Creates the initial MockVehicleSnapshot for a newly added mock vehicle.

import type { BrandKey } from "@/lib/brands/types";
import type { MockVehicleSnapshot } from "./types";
import { getScenario, getStepInfoAt } from "./scenarios";
import { getModelSpec } from "@/lib/brands/models";
import type { VehicleState } from "@/types/vehicle";

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
    batteryHealthPct: null,
    cellVoltages: null,
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
    doorsOpen: null,
    windowsOpen: null,
    isTrunkOpen: null,
    isFrunkOpen: null,
    isSentryMode: false,
    isDashcamRecording: null,
    softwareVersion: null,
    updateAvailable: null,
    updateVersionLabel: null,
    serviceDueAt: null,
    tirePressures: null,
    safetyScore: null,
    efficiencyScore: null,
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
