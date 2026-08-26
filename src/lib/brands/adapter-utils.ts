// Applies a brand's telemetry capability map to a VehicleState, nulling out
// every field the brand does not expose. This runs in the dispatcher after
// tick() so the client only ever sees what the brand actually supports.

import type { TelemetryCapabilities } from "./types";
import type { VehicleState } from "@/types/vehicle";

export function applyCapabilityMask(
  state: VehicleState,
  caps: TelemetryCapabilities,
): VehicleState {
  return {
    ...state,
    // energy / battery
    batteryLevel:       caps.batteryLevel       ? state.batteryLevel       : null,
    batteryRangeKm:     caps.batteryRangeKm     ? state.batteryRangeKm     : null,
    chargeLimit:        caps.chargeLimit        ? state.chargeLimit        : null,
    chargingState:      caps.chargingState      ? state.chargingState      : null,
    chargingRateKw:     caps.chargingRateKw     ? state.chargingRateKw     : null,
    chargeAmps:         caps.chargeAmps         ? state.chargeAmps         : null,
    isChargePortOpen:   caps.chargePortOpen     ? state.isChargePortOpen   : null,
    timeToFullMinutes:  caps.timeToFullMinutes  ? state.timeToFullMinutes  : null,
    batteryHealthPct:   caps.batteryHealthPct   ? state.batteryHealthPct   : null,
    cellVoltages:       caps.cellVoltages       ? state.cellVoltages       : null,
    // drive / motion
    odometerKm:         caps.odometer           ? state.odometerKm         : null,
    speedKmh:           caps.speed              ? state.speedKmh           : null,
    headingDeg:         caps.heading            ? state.headingDeg         : null,
    // location
    latitude:           caps.location           ? state.latitude           : null,
    longitude:          caps.location           ? state.longitude          : null,
    // climate
    interiorTempC:      caps.interiorTemp       ? state.interiorTempC      : null,
    exteriorTempC:      caps.exteriorTemp       ? state.exteriorTempC      : null,
    isClimateOn:        caps.climateOn          ? state.isClimateOn        : null,
    driverTempC:        caps.driverTempSetting  ? state.driverTempC        : null,
    passengerTempC:     caps.passengerTempSetting ? state.passengerTempC   : null,
    hvacMode:           caps.hvacMode           ? state.hvacMode           : null,
    seatHeatingLevel:   caps.seatHeating        ? state.seatHeatingLevel   : null,
    steeringHeating:    caps.steeringHeating    ? state.steeringHeating    : null,
    // body / security
    isLocked:           caps.locked             ? state.isLocked           : null,
    doorsOpen:          caps.doorsOpen          ? state.doorsOpen          : null,
    windowsOpen:        caps.windowsOpen        ? state.windowsOpen        : null,
    isTrunkOpen:        caps.trunkOpen          ? state.isTrunkOpen        : null,
    isFrunkOpen:        caps.frunkOpen          ? state.isFrunkOpen        : null,
    isSentryMode:       caps.sentryMode         ? state.isSentryMode       : null,
    isDashcamRecording: caps.dashcam            ? state.isDashcamRecording : null,
    isRemoteStartActive: caps.remoteStartActive ? state.isRemoteStartActive : null,
    // software / health
    softwareVersion:    caps.softwareVersion    ? state.softwareVersion    : null,
    updateAvailable:    caps.updateAvailable    ? state.updateAvailable    : null,
    // tpms
    tirePressures:      caps.tirePressure       ? state.tirePressures      : null,
    // scores
    safetyScore:        caps.safetyScore        ? state.safetyScore        : null,
    efficiencyScore:    caps.efficiencyScore    ? state.efficiencyScore    : null,
  };
}
