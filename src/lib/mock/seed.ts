// Creates the initial MockVehicleSnapshot for a newly added mock vehicle.

import type { BrandKey, VehicleState } from "@/types/vehicle";
import type { MockVehicleSnapshot } from "./types";
import { getScenario, getStepInfoAt } from "./scenarios";

export function createInitialSnapshot(
  vehicleId: string,
  displayName: string,
  brand: BrandKey,
  scenarioId: string,
): MockVehicleSnapshot {
  const scenario = getScenario(scenarioId) ?? getScenario("commuter")!;
  const now = new Date();
  const { step } = getStepInfoAt(scenario, now);

  const maxRangeKm = (scenario.vehicle.batteryCapacityKwh / scenario.vehicle.efficiencyKwhPer100km) * 100;

  const state: VehicleState = {
    vehicleId,
    displayName,
    brand,
    dataSource: "mock",
    isOnline: true,
    lastSeenAt: now.toISOString(),
    batteryLevel: scenario.initialBatteryLevel,
    batteryRangeKm: (scenario.initialBatteryLevel / 100) * maxRangeKm,
    chargeLimit: 80,
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
    activeChargingSessionStart: null,
    activeChargingSessionNetwork: null,
    activeChargingSessionStartSoc: null,
    activeTripStart: null,
    activeTripStartLat: null,
    activeTripStartLng: null,
    activeTripStartOdometerKm: null,
  };
}
