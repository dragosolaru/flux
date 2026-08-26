import { describe, it, expect } from "vitest";
import { tick, applyCommand } from "../engine";
import { BRANDS } from "@/lib/brands/registry";
import type { MockVehicleSnapshot } from "../types";
import type { VehicleState } from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<MockVehicleSnapshot> = {}): MockVehicleSnapshot {
  const state: VehicleState = {
    vehicleId: "test-vehicle",
    displayName: "Test Car",
    brand: "tesla",
    dataSource: "mock",
    isOnline: true,
    lastSeenAt: null,
    batteryLevel: 75,
    batteryRangeKm: 350,
    chargeLimit: 80,
    chargingState: "disconnected",
    chargingRateKw: null,
    chargeAmps: 32,
    isChargePortOpen: false,
    timeToFullMinutes: null,
    scheduledChargingEnabled: false,
    scheduledChargingStartMinutes: null,
    scheduledDepartureEnabled: false,
    scheduledDepartureMinutes: null,
    batteryHealthPct: null,
    cellVoltages: null,
    motionState: "parked",
    odometerKm: 10000,
    speedKmh: null,
    headingDeg: null,
    latitude: 50.0755,
    longitude: 14.4378,
    interiorTempC: 20,
    exteriorTempC: 15,
    isClimateOn: false,
    driverTempC: null,
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
    isRemoteStartActive: false,
    isDashcamRecording: null,
    isBatteryPreconditioning: null,
    softwareVersion: null,
    updateAvailable: null,
    updateVersionLabel: null,
    serviceDueAt: null,
    tirePressures: null,
    safetyScore: null,
    efficiencyScore: null,
    recordedAt: "2026-01-01T08:00:00Z",
  };

  return {
    state,
    motionState: "parked",
    scenarioId: "commuter",
    lastTickAt: "2026-01-01T08:00:00Z",
    vehicleSpec: null,
    activeChargingSessionStart: null,
    activeChargingSessionNetwork: null,
    activeChargingSessionStartSoc: null,
    activeTripStart: null,
    activeTripStartLat: null,
    activeTripStartLng: null,
    activeTripStartOdometerKm: null,
    ...overrides,
  };
}

const tesla = BRANDS.tesla;

// ---------------------------------------------------------------------------
// tick — determinism
// ---------------------------------------------------------------------------

describe("tick", () => {
  it("is a no-op when now === lastTickAt", () => {
    const snap = makeSnapshot();
    const now = new Date(snap.lastTickAt);
    const result = tick(snap, now, tesla);
    expect(result).toEqual(snap);
  });

  it("advances lastTickAt to now", () => {
    const snap = makeSnapshot();
    const now = new Date("2026-01-01T08:01:00Z");
    const result = tick(snap, now, tesla);
    expect(result.lastTickAt).toBe(now.toISOString());
  });

  it("is deterministic: same inputs → same outputs", () => {
    const snap = makeSnapshot();
    const now = new Date("2026-01-01T10:00:00Z");
    const a = tick(snap, now, tesla);
    const b = tick(snap, now, tesla);
    expect(a).toEqual(b);
  });

  it("does not go back in time (now < lastTickAt)", () => {
    const snap = makeSnapshot();
    const past = new Date("2026-01-01T07:00:00Z");
    const result = tick(snap, past, tesla);
    expect(result.lastTickAt).toBe(snap.lastTickAt);
  });

  it("drains battery while driving", () => {
    // Commuter scenario: 07:00 UTC (25200s offset) is driving
    const snap = makeSnapshot({
      lastTickAt: "2026-01-01T07:00:00Z",
      motionState: "parked",
    });
    const now = new Date("2026-01-01T07:30:00Z"); // 30 min of driving
    const result = tick(snap, now, tesla);

    expect(result.state.batteryLevel).toBeLessThan(snap.state.batteryLevel!);
    expect(result.state.odometerKm).toBeGreaterThan(snap.state.odometerKm!);
    expect(result.state.motionState).toBe("driving");
  });

  it("charges battery while plugged in", () => {
    // Commuter scenario: 00:00 UTC (0s offset) is charging
    const snap = makeSnapshot({
      lastTickAt: "2026-01-01T00:00:00Z",
      motionState: "parked",
      state: {
        ...makeSnapshot().state,
        batteryLevel: 40,
        batteryRangeKm: 200,
      },
    });
    const now = new Date("2026-01-01T01:00:00Z"); // 1h charging
    const result = tick(snap, now, tesla);

    expect(result.state.batteryLevel).toBeGreaterThan(40);
    expect(result.state.chargingState).toBe("charging");
    expect(result.state.chargingRateKw).toBeGreaterThan(0);
  });

  it("caps battery at chargeLimit", () => {
    const snap = makeSnapshot({
      lastTickAt: "2026-01-01T00:00:00Z",
      state: {
        ...makeSnapshot().state,
        batteryLevel: 79,
        chargeLimit: 80,
      },
    });
    const now = new Date("2026-01-01T06:00:00Z"); // 6h charging
    const result = tick(snap, now, tesla);

    expect(result.state.batteryLevel).toBeLessThanOrEqual(80);
  });

  it("keeps battery ≥ 0 even with extended driving", () => {
    const snap = makeSnapshot({
      lastTickAt: "2026-01-01T07:00:00Z",
      state: { ...makeSnapshot().state, batteryLevel: 1, batteryRangeKm: 5 },
    });
    const now = new Date("2026-01-01T09:00:00Z");
    const result = tick(snap, now, tesla);
    expect(result.state.batteryLevel).toBeGreaterThanOrEqual(0);
  });

  it("does not move odometer while parked", () => {
    // 17:30–24:00 in commuter is plugged-idle (step starts at 63600s offset)
    const snap = makeSnapshot({
      lastTickAt: "2026-01-01T18:00:00Z",
      motionState: "plugged-idle",
    });
    const now = new Date("2026-01-01T19:00:00Z");
    const result = tick(snap, now, tesla);
    expect(result.state.odometerKm).toBe(snap.state.odometerKm);
  });

  it("returns null scenarioId snapshot without error", () => {
    const snap = makeSnapshot({ scenarioId: null });
    const now = new Date("2026-01-01T10:00:00Z");
    const result = tick(snap, now, tesla);
    expect(result.lastTickAt).toBe(now.toISOString());
  });
});

// ---------------------------------------------------------------------------
// applyCommand — state mutations
// ---------------------------------------------------------------------------

describe("applyCommand", () => {
  it("lock sets isLocked to true", () => {
    const snap = makeSnapshot({ state: { ...makeSnapshot().state, isLocked: false } });
    const result = applyCommand(snap, "lock", null, tesla);
    expect(result.state.isLocked).toBe(true);
  });

  it("unlock sets isLocked to false", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "unlock", null, tesla);
    expect(result.state.isLocked).toBe(false);
  });

  it("climate_on sets isClimateOn to true", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "climate_on", null, tesla);
    expect(result.state.isClimateOn).toBe(true);
  });

  it("set_charge_limit updates chargeLimit", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "set_charge_limit", { percent: 90 }, tesla);
    expect(result.state.chargeLimit).toBe(90);
  });

  it("set_charge_limit clamps below 50", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "set_charge_limit", { percent: 20 }, tesla);
    expect(result.state.chargeLimit).toBe(50);
  });

  it("set_charge_limit clamps above 100", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "set_charge_limit", { percent: 110 }, tesla);
    expect(result.state.chargeLimit).toBe(100);
  });

  it("activate_sentry sets isSentryMode to true", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "activate_sentry", null, tesla);
    expect(result.state.isSentryMode).toBe(true);
  });

  it("schedule_charging persists enable + start time", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "schedule_charging", { enable: true, time: 1380 }, tesla);
    expect(result.state.scheduledChargingEnabled).toBe(true);
    expect(result.state.scheduledChargingStartMinutes).toBe(1380);
  });

  it("schedule_charging can disable a saved schedule", () => {
    const snap = makeSnapshot({ state: { ...makeSnapshot().state, scheduledChargingEnabled: true } });
    const result = applyCommand(snap, "schedule_charging", { enable: false, time: 1380 }, tesla);
    expect(result.state.scheduledChargingEnabled).toBe(false);
  });

  it("does not mutate the original snapshot", () => {
    const snap = makeSnapshot();
    const originalLocked = snap.state.isLocked;
    applyCommand(snap, "unlock", null, tesla);
    expect(snap.state.isLocked).toBe(originalLocked);
  });
});

// ---------------------------------------------------------------------------
// The commands that used to be accepted and then do nothing.
//
// Every one of these returned success and left the state untouched, so the
// screen showed the old value back and the command read as broken — which is
// exactly what it was reported as. They are pinned individually because the
// failure mode is silent: a `break` with no assignment type-checks, lints and
// passes every other test in this file.
// ---------------------------------------------------------------------------

describe("applyCommand — commands with observable state", () => {
  it("open_charge_port opens the port", () => {
    const result = applyCommand(makeSnapshot(), "open_charge_port", null, tesla);
    expect(result.state.isChargePortOpen).toBe(true);
  });

  it("close_charge_port closes it again", () => {
    const snap = makeSnapshot({ state: { ...makeSnapshot().state, isChargePortOpen: true } });
    const result = applyCommand(snap, "close_charge_port", null, tesla);
    expect(result.state.isChargePortOpen).toBe(false);
  });

  it("set_charge_amps stores the requested current", () => {
    const result = applyCommand(makeSnapshot(), "set_charge_amps", { amps: 16 }, tesla);
    expect(result.state.chargeAmps).toBe(16);
  });

  it("remote_start opens the drive window", () => {
    const result = applyCommand(makeSnapshot(), "remote_start", null, tesla);
    expect(result.state.isRemoteStartActive).toBe(true);
  });

  it("schedule_departure persists the time", () => {
    const result = applyCommand(makeSnapshot(), "schedule_departure", { time: 480 }, tesla);
    expect(result.state.scheduledDepartureEnabled).toBe(true);
    expect(result.state.scheduledDepartureMinutes).toBe(480);
  });

  it("honk and flash still change nothing — they are momentary", () => {
    const before = makeSnapshot();
    expect(applyCommand(before, "honk", null, tesla).state).toEqual(before.state);
    expect(applyCommand(before, "flash", null, tesla).state).toEqual(before.state);
  });
});

describe("tick — port and remote start follow the car", () => {
  it("a charging car has its port open", () => {
    // Commuter scenario: 00:00 UTC is charging.
    const snap = makeSnapshot({
      lastTickAt: "2026-01-01T00:00:00Z",
      state: { ...makeSnapshot().state, isChargePortOpen: false },
    });
    const result = tick(snap, new Date("2026-01-01T01:00:00Z"), tesla);
    expect(result.state.chargingState).toBe("charging");
    expect(result.state.isChargePortOpen).toBe(true);
  });

  it("driving away closes the port and ends the remote start", () => {
    // Commuter scenario: 07:00 UTC is driving.
    const snap = makeSnapshot({
      lastTickAt: "2026-01-01T07:00:00Z",
      state: {
        ...makeSnapshot().state,
        isChargePortOpen: true,
        isRemoteStartActive: true,
      },
    });
    const result = tick(snap, new Date("2026-01-01T07:30:00Z"), tesla);
    expect(result.state.motionState).toBe("driving");
    expect(result.state.isChargePortOpen).toBe(false);
    expect(result.state.isRemoteStartActive).toBe(false);
  });

  it("a parked car keeps a port someone opened", () => {
    // 17:30–24:00 is plugged-idle; 09:00 is parked in the commuter scenario.
    const snap = makeSnapshot({
      lastTickAt: "2026-01-01T09:00:00Z",
      state: { ...makeSnapshot().state, isChargePortOpen: true },
    });
    const result = tick(snap, new Date("2026-01-01T09:30:00Z"), tesla);
    expect(result.state.motionState).toBe("parked");
    expect(result.state.isChargePortOpen).toBe(true);
  });
});
