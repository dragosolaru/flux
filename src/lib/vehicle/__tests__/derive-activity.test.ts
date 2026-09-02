import { describe, expect, it } from "vitest";

import { deriveActivity, type ActivitySnapshot } from "../derive-activity";

/**
 * Rebuilding activity from snapshots.
 *
 * The reported symptom was "7 days and 30 days show the same thing". Both
 * windows were empty: `trips` and `charging_sessions` were written by the
 * simulator and by nothing else, so a real car recorded no activity at all.
 *
 * These pin the judgement calls, because the risk here is not a crash — it is a
 * plausible-looking number derived from readings too far apart to support it.
 */

const CAPACITY = 75;

function snap(
  minutes: number,
  fields: Partial<ActivitySnapshot> = {},
): ActivitySnapshot {
  return {
    recordedAt: new Date(Date.UTC(2026, 0, 1, 8, 0, 0) + minutes * 60_000).toISOString(),
    batteryLevel: 80,
    odometerKm: 1000,
    isCharging: false,
    chargingRateKw: null,
    latitude: 44.43,
    longitude: 26.1,
    ...fields,
  };
}

describe("trips", () => {
  it("measures distance from the odometer, which is exact however sparse the readings", () => {
    const { trips } = deriveActivity(
      [snap(0, { odometerKm: 1000 }), snap(25, { odometerKm: 1042 })],
      CAPACITY,
    );
    expect(trips).toHaveLength(1);
    expect(trips[0]!.distanceKm).toBe(42);
  });

  it("merges consecutive moving readings into one trip", () => {
    const { trips } = deriveActivity(
      [
        snap(0, { odometerKm: 1000 }),
        snap(5, { odometerKm: 1008 }),
        snap(10, { odometerKm: 1020 }),
        snap(15, { odometerKm: 1020 }), // stopped
      ],
      CAPACITY,
    );
    expect(trips).toHaveLength(1);
    expect(trips[0]!.distanceKm).toBe(20);
    expect(trips[0]!.endedAt).toBe(snap(10).recordedAt);
  });

  it("starts a new trip after the car has stood still", () => {
    const { trips } = deriveActivity(
      [
        snap(0, { odometerKm: 1000 }),
        snap(5, { odometerKm: 1010 }),
        snap(60, { odometerKm: 1010 }), // parked
        snap(65, { odometerKm: 1025 }),
      ],
      CAPACITY,
    );
    expect(trips).toHaveLength(2);
    expect(trips.map((t) => t.distanceKm)).toEqual([10, 15]);
  });

  it("ignores an odometer difference too small to be a journey", () => {
    // The column is numeric and the car reports miles we convert, so a parked
    // car wobbles by metres between readings.
    const { trips } = deriveActivity(
      [snap(0, { odometerKm: 1000 }), snap(5, { odometerKm: 1000.08 })],
      CAPACITY,
    );
    expect(trips).toEqual([]);
  });

  it("refuses to call a week-wide gap a trip", () => {
    // Two readings a week apart say the car moved at some point. Emitting one
    // row for it would put a seven-day journey in the activity feed.
    const { trips } = deriveActivity(
      [snap(0, { odometerKm: 1000 }), snap(60 * 24 * 7, { odometerKm: 1400 })],
      CAPACITY,
    );
    expect(trips).toEqual([]);
  });

  it("survives the gap the daily cron actually produces", () => {
    // The background poll runs once a day, so an unattended car's readings
    // arrive ~24h apart. The span limit was 24h exactly, so ordinary scheduler
    // jitter dropped the pair — and the whole day's mileage vanished with no
    // trace. A day of driving must survive both jitter and one missed run.
    const jittered = deriveActivity(
      [snap(0, { odometerKm: 1000 }), snap(60 * 24 + 7, { odometerKm: 1062 })],
      CAPACITY,
    );
    expect(jittered.trips).toHaveLength(1);
    expect(jittered.trips[0]!.distanceKm).toBe(62);

    const missedRun = deriveActivity(
      [snap(0, { odometerKm: 1000 }), snap(60 * 48, { odometerKm: 1130 })],
      CAPACITY,
    );
    expect(missedRun.trips[0]!.distanceKm).toBe(130);
  });

  it("leaves average speed null when the gap is too wide to support one", () => {
    // 42 km between readings six hours apart is not a 7 km/h journey. A wrong
    // number says more than a missing one.
    const { trips } = deriveActivity(
      [snap(0, { odometerKm: 1000 }), snap(360, { odometerKm: 1042 })],
      CAPACITY,
    );
    expect(trips[0]!.distanceKm).toBe(42);
    expect(trips[0]!.avgSpeedKmh).toBeNull();
  });

  it("computes average speed when every gap in the run is short", () => {
    const { trips } = deriveActivity(
      [
        snap(0, { odometerKm: 1000 }),
        snap(10, { odometerKm: 1010 }),
        snap(20, { odometerKm: 1030 }),
      ],
      CAPACITY,
    );
    expect(trips[0]!.avgSpeedKmh).toBe(90);
  });

  it("turns the battery drop into energy and efficiency", () => {
    const { trips } = deriveActivity(
      [
        snap(0, { odometerKm: 1000, batteryLevel: 80 }),
        snap(20, { odometerKm: 1050, batteryLevel: 68 }),
      ],
      CAPACITY,
    );
    // 12% of 75 kWh over 50 km.
    expect(trips[0]!.energyUsedKwh).toBe(9);
    expect(trips[0]!.efficiencyKwhPer100km).toBe(18);
  });

  it("reports no energy for a trip the car charged during", () => {
    // The level went up while the car was also moving — a level difference then
    // says the opposite of what was used.
    const { trips } = deriveActivity(
      [
        snap(0, { odometerKm: 1000, batteryLevel: 40 }),
        snap(20, { odometerKm: 1050, batteryLevel: 60, isCharging: true }),
      ],
      CAPACITY,
    );
    expect(trips[0]!.distanceKm).toBe(50);
    expect(trips[0]!.energyUsedKwh).toBeNull();
    expect(trips[0]!.efficiencyKwhPer100km).toBeNull();
  });
});

describe("charging sessions", () => {
  it("is the run of readings where the car said it was charging", () => {
    const { sessions } = deriveActivity(
      [
        snap(0, { batteryLevel: 40 }),
        snap(10, { batteryLevel: 42, isCharging: true, chargingRateKw: 7 }),
        snap(20, { batteryLevel: 55, isCharging: true, chargingRateKw: 11 }),
        snap(30, { batteryLevel: 55 }),
      ],
      CAPACITY,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.startSoc).toBe(42);
    expect(sessions[0]!.endSoc).toBe(55);
    // 13% of 75 kWh.
    expect(sessions[0]!.energyAddedKwh).toBe(9.75);
    expect(sessions[0]!.maxChargingRateKw).toBe(11);
  });

  it("does not record a session from one reading", () => {
    // The car was charging when we looked. That has no duration and no energy.
    const { sessions } = deriveActivity(
      [snap(0), snap(10, { isCharging: true }), snap(20)],
      CAPACITY,
    );
    expect(sessions).toEqual([]);
  });

  it("separates two plug-ins that were not continuous", () => {
    const { sessions } = deriveActivity(
      [
        snap(0, { batteryLevel: 30, isCharging: true }),
        snap(10, { batteryLevel: 45, isCharging: true }),
        snap(20, { batteryLevel: 45 }),
        snap(30, { batteryLevel: 45, isCharging: true }),
        snap(40, { batteryLevel: 60, isCharging: true }),
      ],
      CAPACITY,
    );
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.startSoc)).toEqual([30, 45]);
  });
});

describe("what it does with nothing to work from", () => {
  it("returns empty rather than throwing on a single reading", () => {
    expect(deriveActivity([snap(0)], CAPACITY)).toEqual({ trips: [], sessions: [] });
    expect(deriveActivity([], CAPACITY)).toEqual({ trips: [], sessions: [] });
  });

  it("skips readings with no odometer instead of treating them as zero", () => {
    // A half-asleep response omits sub-objects. Reading a missing odometer as 0
    // would invent a thousand-kilometre trip.
    const { trips } = deriveActivity(
      [snap(0, { odometerKm: null }), snap(10, { odometerKm: 1000 })],
      CAPACITY,
    );
    expect(trips).toEqual([]);
  });
});
