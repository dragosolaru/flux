import {
  MILES_TO_KM,
  TESLA_REGIONS,
  TESLA_VEHICLE_DATA_ENDPOINTS,
  teslaProxyBaseUrl,
} from "./constants";
import { getValidAccessToken, TeslaAuthError } from "./tokens";
import type {
  TeslaCommand,
  TeslaCommandResponse,
  TeslaRegion,
  TeslaVehicleDataResponse,
  TeslaVehicleListResponse,
} from "@/types/tesla";
import type { VehicleState } from "@/types/vehicle";

function baseUrl(region: string): string {
  return TESLA_REGIONS[region as TeslaRegion] ?? TESLA_REGIONS.eu;
}

export async function fetchVehicleList(params: {
  accessToken: string;
  region: TeslaRegion;
}): Promise<TeslaVehicleListResponse> {
  const res = await fetch(`${baseUrl(params.region)}/api/1/vehicles`, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Tesla vehicle list failed: ${res.status}`);
  }
  return (await res.json()) as TeslaVehicleListResponse;
}

/**
 * Wakes a sleeping vehicle. Tesla returns 200 even before the car is fully
 * awake — the caller should poll vehicle_data with retries.
 */
async function wakeVehicle(params: {
  accessToken: string;
  region: string;
  teslaVehicleId: number;
}) {
  const url = `${baseUrl(params.region)}/api/1/vehicles/${params.teslaVehicleId}/wake_up`;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  }).catch(() => null);
}

export async function fetchVehicleData(params: {
  vehicleId: string;
  userId: string;
  teslaVehicleId: number;
  displayName: string;
}): Promise<VehicleState> {
  const { accessToken, region } = await getValidAccessToken(params.vehicleId, params.userId);

  const url = `${baseUrl(region)}/api/1/vehicles/${params.teslaVehicleId}/vehicle_data?endpoints=${encodeURIComponent(TESLA_VEHICLE_DATA_ENDPOINTS)}`;

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  // If asleep (408) try a single wake_up + short retry before failing.
  if (res.status === 408) {
    await wakeVehicle({
      accessToken,
      region,
      teslaVehicleId: params.teslaVehicleId,
    });
    await new Promise((r) => setTimeout(r, 4_000));
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Revoking access at tesla.com kills the ACCESS token immediately, but our
    // stored one still has a future expiry — so getValidAccessToken hands it
    // back without refreshing, no TeslaAuthError is raised, and this call is
    // the first thing to notice. Without this branch the route fell through to
    // a generic 502 and the dashboard said "check your connection and try
    // again", which is the exact advice the reauth card exists to replace.
    //
    // 403 counts too: on a data endpoint it means the token is not allowed to
    // read this, i.e. a scope was not granted. Re-consenting is the fix for
    // both, and the reconnect screen is where the tickboxes are.
    if (res.status === 401 || res.status === 403) {
      throw new TeslaAuthError(
        `Tesla rejected the access token (${res.status}): ${body.slice(0, 200)}`,
      );
    }
    throw new Error(`Tesla vehicle_data ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as TeslaVehicleDataResponse;
  return mapVehicleData(json, params);
}

export function mapVehicleData(
  json: TeslaVehicleDataResponse,
  params: { vehicleId: string; displayName: string },
): VehicleState {
  // Tesla may omit sub-objects when the car is half-asleep — treat each as
  // optional and fall back to safe defaults so the dashboard renders.
  const r = json.response ?? ({} as TeslaVehicleDataResponse["response"]);
  const charge = r.charge_state ?? null;
  const climate = r.climate_state ?? null;
  const drive = r.drive_state ?? null;
  const veh = r.vehicle_state ?? null;

  return {
    // identity
    vehicleId: params.vehicleId,
    displayName: r.display_name ?? params.displayName,
    brand: "tesla",
    dataSource: "live",
    // connectivity
    isOnline: r.state === "online",
    lastSeenAt: new Date().toISOString(),
    // energy
    batteryLevel: charge?.battery_level ?? null,
    batteryRangeKm: charge?.battery_range != null ? charge.battery_range * MILES_TO_KM : null,
    chargeLimit: charge?.charge_limit_soc ?? null,
    chargingState: mapChargingState(charge?.charging_state ?? "Disconnected"),
    chargingRateKw: charge?.charger_power ?? null,
    timeToFullMinutes: charge?.time_to_full_charge != null
      ? Math.round(charge.time_to_full_charge * 60)
      : null,
    // Live scheduled-charging readback not mapped yet (dormant adapter).
    scheduledChargingEnabled: null,
    scheduledChargingStartMinutes: null,
    batteryHealthPct: estimateSoH(charge, r.vin),
    cellVoltages: null,
    // drive / motion
    motionState: mapMotionState(drive?.shift_state, charge?.charging_state),
    odometerKm: veh?.odometer != null ? veh.odometer * MILES_TO_KM : null,
    speedKmh: drive?.speed != null ? Math.round(drive.speed * MILES_TO_KM) : null,
    headingDeg: drive?.heading ?? null,
    // location
    latitude: drive?.latitude ?? null,
    longitude: drive?.longitude ?? null,
    // climate
    interiorTempC: climate?.inside_temp ?? null,
    exteriorTempC: climate?.outside_temp ?? null,
    isClimateOn: climate?.is_climate_on ?? null,
    driverTempC: climate?.driver_temp_setting ?? null,
    passengerTempC: climate?.passenger_temp_setting ?? null,
    hvacMode: climate?.climate_keeper_mode ?? null,
    seatHeatingLevel: climate?.seat_heater_left ?? null,
    steeringHeating: climate?.steering_wheel_heater ?? null,
    // body / security
    isLocked: veh?.locked ?? null,
    doorsOpen: mapOpenings(veh, ["df", "pf", "dr", "pr"]),
    windowsOpen: mapOpenings(veh, [
      "fd_window",
      "fp_window",
      "rd_window",
      "rp_window",
    ]),
    isTrunkOpen: isOpen(veh?.rt),
    isFrunkOpen: isOpen(veh?.ft),
    isSentryMode: veh?.sentry_mode ?? null,
    isDashcamRecording: veh?.dashcam_state != null
      ? veh.dashcam_state === "Recording"
      : null,
    // Read from the car rather than hardcoded null. Flux could send
    // precondition_max but never show whether it took effect — the field was
    // written only by the simulator, so a linked car reported "unknown"
    // forever and the driver had no way to tell a working command from a
    // silently rejected one.
    isBatteryPreconditioning: climate?.battery_heater ?? climate?.battery_heater_on ?? null,
    // software
    softwareVersion: veh?.car_version ?? null,
    // Tesla reports "available", "downloading", "downloading_wifi_wait",
    // "scheduled" and "installing" here; anything other than an empty status
    // means there is an update the driver has not taken yet.
    updateAvailable: veh?.software_update
      ? !!veh.software_update.status
      : null,
    updateVersionLabel: veh?.software_update?.version || null,
    serviceDueAt: null,
    // tpms
    tirePressures: mapTirePressures(veh),
    // scores
    safetyScore: null,
    efficiencyScore: null,
    // metadata
    recordedAt: new Date().toISOString(),
  };
}

type VehStateFields = NonNullable<
  NonNullable<TeslaVehicleDataResponse["response"]>["vehicle_state"]
>;

/** Tesla sends openings as numbers where 0 is closed, not booleans. */
function isOpen(v: number | null | undefined): boolean | null {
  return v == null ? null : v !== 0;
}

/**
 * Doors and windows in Flux's left/right order, from Tesla's driver/passenger
 * naming. Right-hand-drive cars would mirror, but Tesla reports the physical
 * side regardless of the wheel, so no swap is needed.
 *
 * All four have to be present: a half-asleep car that reports two of them
 * would otherwise render "closed" for the two it never mentioned.
 */
function mapOpenings(
  veh: VehStateFields | null,
  [fl, fr, rl, rr]: (keyof VehStateFields)[],
) {
  if (!veh) return null;
  const vals = [fl, fr, rl, rr].map((k) => isOpen(veh[k] as number | null | undefined));
  if (vals.some((v) => v === null)) return null;
  return {
    frontLeft: vals[0]!,
    frontRight: vals[1]!,
    rearLeft: vals[2]!,
    rearRight: vals[3]!,
  };
}

/** Tesla reports tyre pressure in bar; the rest of Flux works in kPa. */
function mapTirePressures(veh: VehStateFields | null) {
  if (!veh) return null;
  const bar = [
    veh.tpms_pressure_fl,
    veh.tpms_pressure_fr,
    veh.tpms_pressure_rl,
    veh.tpms_pressure_rr,
  ];
  if (bar.some((v) => v == null)) return null;
  const [fl, fr, rl, rr] = bar.map((v) => Math.round(v! * 100));
  return {
    frontLeftKpa: fl,
    frontRightKpa: fr,
    rearLeftKpa: rl,
    rearRightKpa: rr,
  };
}

function mapMotionState(
  shift: string | null | undefined,
  charging: string | null | undefined,
): VehicleState["motionState"] {
  if (charging === "Charging") return "charging";
  // Plugged in but not drawing power — "Complete" and "Stopped" both mean the
  // cable is still attached.
  if (charging === "Complete" || charging === "Stopped") return "plugged-idle";
  if (shift == null) return null;
  return shift === "P" ? "parked" : "driving";
}

export async function sendVehicleCommand(params: {
  vehicleId: string;
  userId: string;
  teslaVehicleId: number;
  /** Required when routing through the signing proxy — see below. */
  vin?: string | null;
  command: TeslaCommand;
  body?: Record<string, unknown>;
  /**
   * False for commands the signing proxy cannot carry, so they go straight to
   * Tesla's REST endpoint. Defaults to signed.
   */
  signed?: boolean;
}): Promise<TeslaCommandResponse> {
  const { accessToken, region } = await getValidAccessToken(params.vehicleId, params.userId);

  // For Model 3/Y/S/X post-2021 Tesla requires command signing via the
  // Vehicle Command Protocol. We delegate that to a self-hosted proxy
  // (the tesla-http-proxy Go binary). When TESLA_PROXY_BASE_URL is set,
  // route through the proxy; otherwise hit Tesla directly (works for
  // pre-2021 Model S/X and for cars where REST commands still pass).
  // Throws on a plaintext proxy URL rather than sending the access token over
  // it — see teslaProxyBaseUrl.
  //
  // Not every command can go through it. The proxy switches on the command
  // name and answers `400 invalid_command` for anything it does not implement
  // — locally, without ever contacting Tesla. `navigation_gps_request` is one
  // of those: pkg/proxy/command.go handles `navigation_request` (by returning
  // ErrCommandUseRESTAPI, which the proxy then forwards) and has no case for
  // the GPS variant at all. So "send to navigation" could not work, and failed
  // with a Tesla-shaped error that named nothing useful.
  //
  // These commands are unsigned by nature — Tesla's own note in that file is
  // that sharing endpoints "often require server-side processing, which
  // prevents strict end-to-end authentication" — so bypassing the proxy loses
  // nothing that was ever available.
  const proxyBase = params.signed === false ? null : teslaProxyBaseUrl();
  const apiBase = proxyBase || baseUrl(region);

  // The proxy demands a 17-character VIN and refuses the numeric Fleet API id
  // outright — pkg/proxy/proxy.go in teslamotors/vehicle-command answers
  // `404 expected 17-character VIN in path (do not user Fleet API ID)`. We were
  // sending the id, so every signed command 404'd before it reached Tesla, and
  // no amount of pairing could help: the request never got far enough to care.
  //
  // Tesla's own REST API accepts either, so the direct path keeps the id rather
  // than depending on a column that could be null on an older row.
  let tag = String(params.teslaVehicleId);
  if (proxyBase) {
    if (!params.vin || params.vin.length !== 17) {
      throw new Error(
        `PROXY_NEEDS_VIN: the signing proxy requires a 17-character VIN, got ${
          params.vin ? `${params.vin.length} characters` : "none"
        }`,
      );
    }
    tag = params.vin;
  }

  const url = `${apiBase}/api/1/vehicles/${tag}/command/${params.command}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    // Never reached the proxy at all: DNS, a certificate the platform has not
    // issued yet, a firewall. fetch throws rather than returning a status, so
    // without this the failure was indistinguishable from the car refusing the
    // command — and the two have nothing in common. Names the host, because
    // "cannot reach the proxy" is only useful if you know which one.
    const host = (() => {
      try {
        return new URL(apiBase).host;
      } catch {
        return apiBase;
      }
    })();
    throw new Error(
      `PROXY_UNREACHABLE: could not connect to ${host} — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Same reasoning as fetchVehicleData: a revoked grant shows up here as a
    // 401, and "command failed" is the wrong thing to tell someone whose
    // authorisation is gone.
    //
    // 403 belongs here too — on a command endpoint it usually means the grant
    // never carried the scope, which no retry fixes — but ONLY after checking
    // the body, because Tesla also answers 403 for "Vehicle Command Protocol
    // required". Classifying that as an auth failure told the driver to
    // re-authorise Tesla when the actual fix is deploying the signing proxy,
    // and it did so by shadowing the string match in commands/route.ts, which
    // runs after the TeslaAuthError check. Status alone cannot tell these
    // apart; the body can.
    const isCommandProtocol =
      /Vehicle Command Protocol required|has not been paired with the vehicle/i.test(body);
    if (res.status === 401 || (res.status === 403 && !isCommandProtocol)) {
      throw new TeslaAuthError(
        `Tesla rejected the access token (${res.status}): ${body.slice(0, 200)}`,
      );
    }
    throw new Error(`Tesla command ${res.status}: ${body.slice(0, 200)}`);
  }

  return (await res.json()) as TeslaCommandResponse;
}

/**
 * Rated range (miles) for known Tesla models, keyed by the 4th VIN character
 * (0-indexed position 3), which encodes the model/variant.
 * Sources: EPA-rated range figures.
 */
const RATED_RANGE_BY_VIN_MODEL: Record<string, number> = {
  // Model 3 Long Range
  F: 358,
  // Model Y Long Range
  Y: 330,
  // Model S
  S: 405,
  // Model X
  X: 348,
};

const DEFAULT_RATED_RANGE_MILES = 330;

/**
 * Estimates State of Health (SoH) from charge_state telemetry.
 *
 * Formula:
 *   estimated_full_range = battery_range / (battery_level / 100)
 *   soh = (estimated_full_range / rated_range) × 100
 *
 * Only computed when battery_level > 15 to avoid noise at very low SOC.
 * Result is clamped to [50, 105] and rounded to 1 decimal.
 */
function estimateSoH(
  charge: Partial<import("@/types/tesla").TeslaChargeState> | null,
  vin: string | undefined,
): number | null {
  if (!charge) return null;
  const { battery_level: soc, battery_range: rangeAtSoc } = charge;
  if (soc == null || rangeAtSoc == null) return null;
  if (soc <= 15) return null;

  const estimatedFullRange = rangeAtSoc / (soc / 100);

  // VIN character at index 3 identifies the model/variant.
  const modelKey = vin?.[3]?.toUpperCase() ?? "";
  const ratedRange =
    RATED_RANGE_BY_VIN_MODEL[modelKey] ?? DEFAULT_RATED_RANGE_MILES;

  const soh = (estimatedFullRange / ratedRange) * 100;

  // Clamp to [50, 105] and round to 1 decimal.
  return Math.round(Math.min(105, Math.max(50, soh)) * 10) / 10;
}

function mapChargingState(
  raw: string,
): VehicleState["chargingState"] {
  switch (raw) {
    case "Charging":
      return "charging";
    case "Complete":
      return "complete";
    case "Stopped":
      return "stopped";
    case "NoPower":
      return "no_power";
    default:
      return "disconnected";
  }
}
