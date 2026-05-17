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
    timeToFullMinutes: null,
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
    isDashcamRecording: null,
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
    const result = applyCommand(snap, "set_charge_limit", { limitPct: 90 }, tesla);
    expect(result.state.chargeLimit).toBe(90);
  });

  it("set_charge_limit clamps below 50", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "set_charge_limit", { limitPct: 20 }, tesla);
    expect(result.state.chargeLimit).toBe(50);
  });

  it("set_charge_limit clamps above 100", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "set_charge_limit", { limitPct: 110 }, tesla);
    expect(result.state.chargeLimit).toBe(100);
  });

  it("activate_sentry sets isSentryMode to true", () => {
    const snap = makeSnapshot();
    const result = applyCommand(snap, "activate_sentry", null, tesla);
    expect(result.state.isSentryMode).toBe(true);
  });

  it("throws command-not-supported for restricted brand", () => {
    const snap = makeSnapshot({ state: { ...makeSnapshot().state, brand: "renault" } });
    expect(() => applyCommand(snap, "honk", null, BRANDS.renault)).toThrow(
      "command-not-supported:honk",
    );
  });

  it("throws for flash on Polestar", () => {
    expect(() =>
      applyCommand(makeSnapshot(), "flash", null, BRANDS.polestar),
    ).toThrow("command-not-supported:flash");
  });

  it("does not mutate the original snapshot", () => {
    const snap = makeSnapshot();
    const originalLocked = snap.state.isLocked;
    applyCommand(snap, "unlock", null, tesla);
    expect(snap.state.isLocked).toBe(originalLocked);
  });
});
