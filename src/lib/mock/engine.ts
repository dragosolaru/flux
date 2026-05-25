// =============================================================================
// Tier-3 stateful mock simulator engine.
//
// tick()         — pure: advance snapshot to `now`, one scenario step at a time
// applyCommand() — pure: mutate state for a command, reject if brand can't do it
// =============================================================================

import type { BrandProfile } from "@/lib/brands/types";
import { COMMAND_CAP_MAP } from "@/lib/brands/command-map";
import type { MotionState, VehicleState } from "@/types/vehicle";
import type { CommandName } from "@/types/history";
import { getScenario, getStepInfoAt } from "./scenarios";
import type { MockVehicleSnapshot, Scenario, ScenarioStep } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

// ---------------------------------------------------------------------------
// Physics for a single time chunk within one scenario step
// ---------------------------------------------------------------------------

function applyChunk(
  snapshot: MockVehicleSnapshot,
  step: ScenarioStep,
  chunkSeconds: number,
  positionAtStart: number, // seconds into this step at chunk start
  stepDuration: number,
  scenario: Scenario,
): MockVehicleSnapshot {
  if (chunkSeconds <= 0) return snapshot;

  // Brand/model spec overrides scenario defaults when set
  const vehicleSpec = snapshot.vehicleSpec ?? scenario.vehicle;

  const state: VehicleState = { ...snapshot.state };
  const battery = state.batteryLevel ?? scenario.initialBatteryLevel;
  const odometer = state.odometerKm ?? 0;
  const cap = vehicleSpec.batteryCapacityKwh;

  switch (step.motionState) {
    case "driving": {
      const speed = step.avgSpeedKmh ?? 80;
      const distKm = speed * (chunkSeconds / 3600);
      const drainKwh = (distKm / 100) * vehicleSpec.efficiencyKwhPer100km;
      const drainPct = (drainKwh / cap) * 100;

      state.batteryLevel = Math.max(0, battery - drainPct);
      state.batteryRangeKm =
        (state.batteryLevel / 100) * ((cap / vehicleSpec.efficiencyKwhPer100km) * 100);
      state.odometerKm = odometer + distKm;
      state.speedKmh = speed;
      state.chargingState = "disconnected";
      state.chargingRateKw = 0;
      state.timeToFullMinutes = null;
      state.motionState = "driving";

      if (step.targetLocation) {
        const progress = (positionAtStart + chunkSeconds) / stepDuration;
        state.latitude = lerp(step.location.lat, step.targetLocation.lat, progress);
        state.longitude = lerp(step.location.lng, step.targetLocation.lng, progress);
      } else {
        state.latitude = step.location.lat;
        state.longitude = step.location.lng;
      }
      break;
    }

    case "charging": {
      const rate = step.chargingRateKw ?? vehicleSpec.maxAcChargingRateKw;
      const limit = state.chargeLimit ?? 80;

      if (battery < limit) {
        const gainKwh = rate * (chunkSeconds / 3600);
        const gainPct = (gainKwh / cap) * 100;
        state.batteryLevel = Math.min(limit, battery + gainPct);
        state.batteryRangeKm =
          (state.batteryLevel / 100) * ((cap / vehicleSpec.efficiencyKwhPer100km) * 100);
        state.chargingState = "charging";
        state.chargingRateKw = rate;
        state.timeToFullMinutes = Math.ceil(
          ((limit - state.batteryLevel) / 100) * cap / rate * 60,
        );
      } else {
        state.chargingState = "complete";
        state.chargingRateKw = 0;
        state.timeToFullMinutes = 0;
      }

      state.speedKmh = 0;
      state.motionState = "charging";
      state.latitude = step.location.lat;
      state.longitude = step.location.lng;
      break;
    }

    case "plugged-idle": {
      // Battery full — maintain charge, no active charging rate
      state.chargingState = battery >= (state.chargeLimit ?? 80) ? "complete" : "charging";
      if (state.chargingState === "charging") {
        const rate = step.chargingRateKw ?? vehicleSpec.maxAcChargingRateKw;
        const gainKwh = rate * (chunkSeconds / 3600);
        state.batteryLevel = Math.min(state.chargeLimit ?? 80, battery + (gainKwh / cap) * 100);
        state.chargingRateKw = rate;
      } else {
        state.chargingRateKw = 0;
        state.timeToFullMinutes = 0;
      }

      state.speedKmh = 0;
      state.motionState = "plugged-idle";
      state.latitude = step.location.lat;
      state.longitude = step.location.lng;
      break;
    }

    case "parked": {
      // Climate drain only
      if (state.isClimateOn) {
        const climateKw = 1.5;
        const drainKwh = climateKw * (chunkSeconds / 3600);
        const drainPct = (drainKwh / cap) * 100;
        state.batteryLevel = Math.max(0, battery - drainPct);
        state.batteryRangeKm =
          (state.batteryLevel / 100) * ((cap / vehicleSpec.efficiencyKwhPer100km) * 100);
      }

      state.chargingState = "disconnected";
      state.chargingRateKw = 0;
      state.timeToFullMinutes = null;
      state.speedKmh = 0;
      state.motionState = "parked";
      state.latitude = step.location.lat;
      state.longitude = step.location.lng;
      break;
    }
  }

  // Climate settings from scenario step
  if (step.climateOn !== undefined) state.isClimateOn = step.climateOn;
  if (step.driverTempC !== undefined) state.driverTempC = step.driverTempC;

  state.recordedAt = new Date().toISOString();

  return { ...snapshot, state, motionState: step.motionState };
}

// ---------------------------------------------------------------------------
// tick — advance snapshot from lastTickAt to now
// ---------------------------------------------------------------------------

export function tick(
  snapshot: MockVehicleSnapshot,
  now: Date,
  _brand: BrandProfile,
): MockVehicleSnapshot {
  // Brand profile is part of the public signature so the dispatcher can pass
  // through, but the engine physics is brand-agnostic — the capability mask is
  // applied in the API layer after tick.
  const fromTime = new Date(snapshot.lastTickAt);
  const elapsedMs = now.getTime() - fromTime.getTime();
  if (elapsedMs <= 0) return snapshot;

  const scenario = getScenario(snapshot.scenarioId);
  if (!scenario) return { ...snapshot, lastTickAt: now.toISOString() };

  let current = snapshot;
  let cursor = fromTime;
  let prevMotion: MotionState = snapshot.motionState;

  while (cursor < now) {
    const { step, stepDuration, positionInStep } = getStepInfoAt(scenario, cursor);
    const remainingInStep = stepDuration - positionInStep;
    const remainingTotal = (now.getTime() - cursor.getTime()) / 1000;
    const chunkSeconds = Math.min(remainingInStep, remainingTotal);

    if (chunkSeconds < 0.001) break;

    // Detect motion-state transition for history session tracking
    if (step.motionState !== prevMotion) {
      current = handleTransition(current, prevMotion, step.motionState, cursor);
      prevMotion = step.motionState;
    }

    current = applyChunk(current, step, chunkSeconds, positionInStep, stepDuration, scenario);
    cursor = new Date(cursor.getTime() + chunkSeconds * 1000);
  }

  return { ...current, lastTickAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// handleTransition — open/close active session records on motion-state change
// ---------------------------------------------------------------------------

function handleTransition(
  snapshot: MockVehicleSnapshot,
  from: MotionState,
  to: MotionState,
  at: Date,
): MockVehicleSnapshot {
  const iso = at.toISOString();
  let next = { ...snapshot };

  // Close trip
  if (from === "driving" && next.activeTripStart) {
    // Persistence layer will detect activeTripStart → null as "close trip"
    next = { ...next, activeTripStart: null, activeTripStartLat: null, activeTripStartLng: null, activeTripStartOdometerKm: null };
  }

  // Close charging session
  if ((from === "charging" || from === "plugged-idle") && next.activeChargingSessionStart) {
    next = { ...next, activeChargingSessionStart: null, activeChargingSessionNetwork: null, activeChargingSessionStartSoc: null };
  }

  // Open trip
  if (to === "driving" && !next.activeTripStart) {
    next = {
      ...next,
      activeTripStart: iso,
      activeTripStartLat: next.state.latitude,
      activeTripStartLng: next.state.longitude,
      activeTripStartOdometerKm: next.state.odometerKm,
    };
  }

  // Open charging session
  if ((to === "charging" || to === "plugged-idle") && !next.activeChargingSessionStart) {
    next = {
      ...next,
      activeChargingSessionStart: iso,
      activeChargingSessionNetwork: null, // filled by persistence from step info
      activeChargingSessionStartSoc: next.state.batteryLevel,
    };
  }

  return next;
}

// ---------------------------------------------------------------------------
// applyCommand — mutate state for a user command
// ---------------------------------------------------------------------------


export function applyCommand(
  snapshot: MockVehicleSnapshot,
  command: CommandName,
  args: Record<string, unknown> | null,
  brand: BrandProfile,
): MockVehicleSnapshot {
  const capKey = COMMAND_CAP_MAP[command];
  if (!brand.capabilities.commands[capKey]) {
    throw new Error(`command-not-supported:${command}`);
  }

  const state: VehicleState = { ...snapshot.state };

  switch (command) {
    case "lock":              state.isLocked = true;   break;
    case "unlock":            state.isLocked = false;  break;
    case "climate_on":        state.isClimateOn = true;  break;
    case "climate_off":       state.isClimateOn = false; break;
    case "set_climate_temp":
      if (typeof args?.temp === "number") state.driverTempC = args.temp;
      break;
    case "honk":
    case "flash":
      break; // side-effect only; no state mutation in mock
    case "set_charge_limit":
      if (typeof args?.limitPct === "number")
        state.chargeLimit = Math.max(50, Math.min(100, args.limitPct));
      break;
    case "set_charge_amps":
      break; // affects next tick's chargingRateKw; no-op for v1 mock
    case "start_charging":   state.chargingState = "charging"; break;
    case "stop_charging":    state.chargingState = "stopped";  break;
    case "open_charge_port":
    case "close_charge_port":
      break; // no dedicated field yet
    case "vent_windows":
      state.windowsOpen = state.windowsOpen
        ? { ...state.windowsOpen, frontLeft: true, frontRight: true }
        : { frontLeft: true, frontRight: true, rearLeft: false, rearRight: false };
      break;
    case "close_windows":
      state.windowsOpen = { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false };
      break;
    case "activate_sentry":   state.isSentryMode = true;   break;
    case "deactivate_sentry": state.isSentryMode = false;  break;
    case "remote_start":      break;
    case "schedule_charging":  break; // no mock state mutation needed
    case "schedule_departure": break; // no mock state mutation needed
    case "precondition_max":   break; // no mock state mutation needed
  }

  return { ...snapshot, state };
}
