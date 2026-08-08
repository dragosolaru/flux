// Most of these fields were hardcoded `null` in the mapper, so a linked car
// reported "unknown" for doors, windows, tyres, speed and pending updates
// while Tesla was sending all of it. Filling them in means trusting three
// conversions that are easy to get backwards:
//
//   tpms_pressure_* is bar, Flux stores kPa
//   drive_state.speed is mph, Flux stores km/h
//   openings are numbers where 0 is closed — NOT booleans, so a plain
//   truthiness check reads every closed door as open
//
// and one rule: a half-asleep car that reports two of four doors must produce
// null, not a confident "the other two are shut".

import { describe, it, expect } from "vitest";

import { mapVehicleData } from "../api";
import type { TeslaVehicleDataResponse } from "@/types/tesla";

const PARAMS = { vehicleId: "veh-1", displayName: "Fallback" };

function build(
  response: Partial<TeslaVehicleDataResponse["response"]>,
): TeslaVehicleDataResponse {
  return {
    response: {
      id: 1,
      vehicle_id: 2,
      vin: "5YJ3E1EA7KF000000",
      display_name: "Nikola",
      state: "online",
      ...response,
    },
  } as TeslaVehicleDataResponse;
}

describe("mapVehicleData — openings", () => {
  it("reads 0 as closed and any non-zero as open", () => {
    const s = mapVehicleData(
      build({
        vehicle_state: { df: 0, pf: 1, dr: 0, pr: 0, ft: 0, rt: 255 },
      }),
      PARAMS,
    );
    expect(s.doorsOpen).toEqual({
      frontLeft: false,
      frontRight: true,
      rearLeft: false,
      rearRight: false,
    });
    expect(s.isFrunkOpen).toBe(false);
    expect(s.isTrunkOpen).toBe(true);
  });

  it("maps windows independently of doors", () => {
    const s = mapVehicleData(
      build({
        vehicle_state: {
          fd_window: 0,
          fp_window: 0,
          rd_window: 1,
          rp_window: 0,
        },
      }),
      PARAMS,
    );
    expect(s.windowsOpen).toEqual({
      frontLeft: false,
      frontRight: false,
      rearLeft: true,
      rearRight: false,
    });
    // Doors were not reported at all.
    expect(s.doorsOpen).toBeNull();
  });

  it("is null when the car reported only some of the four", () => {
    const s = mapVehicleData(
      build({ vehicle_state: { df: 0, pf: 0 } }),
      PARAMS,
    );
    expect(s.doorsOpen).toBeNull();
  });

  it("is null when there is no vehicle_state at all", () => {
    const s = mapVehicleData(build({}), PARAMS);
    expect(s.doorsOpen).toBeNull();
    expect(s.windowsOpen).toBeNull();
    expect(s.isTrunkOpen).toBeNull();
    expect(s.isFrunkOpen).toBeNull();
  });
});

describe("mapVehicleData — unit conversions", () => {
  it("converts tyre pressure from bar to kPa", () => {
    const s = mapVehicleData(
      build({
        vehicle_state: {
          tpms_pressure_fl: 2.9,
          tpms_pressure_fr: 2.9,
          tpms_pressure_rl: 3.1,
          tpms_pressure_rr: 3.05,
        },
      }),
      PARAMS,
    );
    expect(s.tirePressures).toEqual({
      frontLeftKpa: 290,
      frontRightKpa: 290,
      rearLeftKpa: 310,
      rearRightKpa: 305,
    });
  });

  it("needs all four tyres before reporting any", () => {
    const s = mapVehicleData(
      build({ vehicle_state: { tpms_pressure_fl: 2.9, tpms_pressure_fr: 2.9 } }),
      PARAMS,
    );
    expect(s.tirePressures).toBeNull();
  });

  it("converts speed from mph to km/h", () => {
    const s = mapVehicleData(build({ drive_state: { speed: 60 } }), PARAMS);
    expect(s.speedKmh).toBe(97);
  });

  it("keeps a parked car's null speed as null rather than zero", () => {
    const s = mapVehicleData(build({ drive_state: { speed: null } }), PARAMS);
    expect(s.speedKmh).toBeNull();
  });

  it("maps a standstill as 0 km/h, not null", () => {
    const s = mapVehicleData(build({ drive_state: { speed: 0 } }), PARAMS);
    expect(s.speedKmh).toBe(0);
  });
});

describe("mapVehicleData — location", () => {
  it("carries latitude and longitude through", () => {
    const s = mapVehicleData(
      build({ drive_state: { latitude: 40.6401, longitude: 22.9444 } }),
      PARAMS,
    );
    expect(s.latitude).toBeCloseTo(40.6401);
    expect(s.longitude).toBeCloseTo(22.9444);
  });

  // What a grant without vehicle_location, or a request without the
  // location_data endpoint, actually looks like: drive_state arrives, position
  // does not.
  it("is null when drive_state came back without a position", () => {
    const s = mapVehicleData(build({ drive_state: { heading: 90 } }), PARAMS);
    expect(s.latitude).toBeNull();
    expect(s.longitude).toBeNull();
    expect(s.headingDeg).toBe(90);
  });
});

describe("mapVehicleData — motion state", () => {
  it("prefers charging over the shift position", () => {
    const s = mapVehicleData(
      build({
        drive_state: { shift_state: "P" },
        charge_state: { charging_state: "Charging" },
      }),
      PARAMS,
    );
    expect(s.motionState).toBe("charging");
  });

  it("treats a finished session as still plugged in", () => {
    const s = mapVehicleData(
      build({ charge_state: { charging_state: "Complete" } }),
      PARAMS,
    );
    expect(s.motionState).toBe("plugged-idle");
  });

  it("is parked in P and driving otherwise", () => {
    const parked = mapVehicleData(
      build({
        drive_state: { shift_state: "P" },
        charge_state: { charging_state: "Disconnected" },
      }),
      PARAMS,
    );
    const driving = mapVehicleData(
      build({
        drive_state: { shift_state: "D" },
        charge_state: { charging_state: "Disconnected" },
      }),
      PARAMS,
    );
    expect(parked.motionState).toBe("parked");
    expect(driving.motionState).toBe("driving");
  });

  it("is unknown when the car reported no shift state", () => {
    const s = mapVehicleData(build({ drive_state: { heading: 0 } }), PARAMS);
    expect(s.motionState).toBeNull();
  });
});

describe("mapVehicleData — software and dashcam", () => {
  it("flags an update when Tesla reports a status", () => {
    const s = mapVehicleData(
      build({
        vehicle_state: {
          car_version: "2024.8.9 abc",
          software_update: { status: "available", version: "2024.14.3" },
        },
      }),
      PARAMS,
    );
    expect(s.updateAvailable).toBe(true);
    expect(s.updateVersionLabel).toBe("2024.14.3");
    expect(s.softwareVersion).toBe("2024.8.9 abc");
  });

  it("reports no update when the status is empty", () => {
    const s = mapVehicleData(
      build({ vehicle_state: { software_update: { status: "", version: "" } } }),
      PARAMS,
    );
    expect(s.updateAvailable).toBe(false);
    expect(s.updateVersionLabel).toBeNull();
  });

  it("distinguishes a recording dashcam from an unavailable one", () => {
    const on = mapVehicleData(
      build({ vehicle_state: { dashcam_state: "Recording" } }),
      PARAMS,
    );
    const off = mapVehicleData(
      build({ vehicle_state: { dashcam_state: "Unavailable" } }),
      PARAMS,
    );
    const unknown = mapVehicleData(build({ vehicle_state: {} }), PARAMS);
    expect(on.isDashcamRecording).toBe(true);
    expect(off.isDashcamRecording).toBe(false);
    expect(unknown.isDashcamRecording).toBeNull();
  });
});
