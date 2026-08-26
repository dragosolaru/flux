import { describe, expect, it } from "vitest";

import { optimisticPatch } from "../useVehicleCommand";
import type { CommandName } from "@/types/history";

/**
 * A command that changes a field the screen shows must patch that field.
 *
 * Without a patch the row keeps reporting the old value for the four seconds
 * it takes the car to apply the command and for us to read it back — so the
 * tap looks like it did nothing, which is how "sentry doesn't work" and "the
 * charge port doesn't work" were reported. It is not a crash and no other test
 * sees it: the command really was sent, and it really did succeed.
 *
 * The list below is every command with a corresponding VehicleState field.
 * Adding one without a patch fails here.
 */
const PATCHED: [CommandName, Record<string, unknown> | null, Partial<Record<string, unknown>>][] = [
  ["lock", null, { isLocked: true }],
  ["unlock", null, { isLocked: false }],
  ["climate_on", null, { isClimateOn: true }],
  ["climate_off", null, { isClimateOn: false }],
  ["start_charging", null, { chargingState: "charging" }],
  ["stop_charging", null, { chargingState: "stopped" }],
  ["open_charge_port", null, { isChargePortOpen: true }],
  ["close_charge_port", null, { isChargePortOpen: false }],
  ["activate_sentry", null, { isSentryMode: true }],
  ["deactivate_sentry", null, { isSentryMode: false }],
  ["remote_start", null, { isRemoteStartActive: true }],
  ["set_charge_limit", { percent: 90 }, { chargeLimit: 90 }],
  ["set_charge_amps", { amps: 16 }, { chargeAmps: 16 }],
  ["set_climate_temp", { temp: 22 }, { driverTempC: 22 }],
  ["precondition_max", { on: true }, { isBatteryPreconditioning: true }],
  [
    "schedule_charging",
    { enable: true, time: 1380 },
    { scheduledChargingEnabled: true, scheduledChargingStartMinutes: 1380 },
  ],
  [
    "schedule_departure",
    { time: 480 },
    { scheduledDepartureEnabled: true, scheduledDepartureMinutes: 480 },
  ],
];

describe("optimisticPatch", () => {
  it.each(PATCHED)("%s patches the field it changes", (command, args, expected) => {
    expect(optimisticPatch(command, args)).toMatchObject(expected);
  });

  it("opens all four windows on vent, closes all four on close", () => {
    expect(optimisticPatch("vent_windows")).toEqual({
      windowsOpen: { frontLeft: true, frontRight: true, rearLeft: false, rearRight: false },
    });
    expect(optimisticPatch("close_windows")).toEqual({
      windowsOpen: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
    });
  });

  it("patches nothing for commands that change nothing", () => {
    // Momentary: the horn stops, the lights stop, and the car is exactly as it
    // was. A patch here would invent a state the car does not have.
    expect(optimisticPatch("honk")).toBeNull();
    expect(optimisticPatch("flash")).toBeNull();
    expect(optimisticPatch("share_navigation", { lat: 1, lng: 2 })).toBeNull();
  });

  it("refuses a value it cannot trust rather than showing a wrong one", () => {
    expect(optimisticPatch("set_charge_limit", { percent: 150 })).toBeNull();
    expect(optimisticPatch("set_charge_amps", { amps: "16" })).toBeNull();
    expect(optimisticPatch("set_climate_temp", null)).toBeNull();
  });
});
