import {
  MILES_TO_KM,
  TESLA_REGIONS,
  TESLA_VEHICLE_DATA_ENDPOINTS,
  teslaProxyBaseUrl,
} from "./constants";
import { getValidAccessToken, TeslaAuthError } from "./tokens";
import { recordTeslaCall } from "./call-log";
import type {
  TeslaChargeState,
  TeslaCommand,
  TeslaCommandResponse,
  TeslaRegion,
  TeslaVehicleConfig,
  TeslaVehicleDataResponse,
  TeslaVehicleListResponse,
} from "@/types/tesla";
import type { BatteryChemistry, VehicleState } from "@/types/vehicle";
import { cachedRead, chargeReadBudget, storeRead, type CallReason } from "./budget";

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

/**
 * The car is asleep and we chose not to wake it.
 *
 * A distinct error rather than a failure, because it is the normal state of a
 * parked car and the caller's right answer is "show the last known reading",
 * not "something went wrong".
 */
export class TeslaAsleepError extends Error {
  constructor() {
    super("Vehicle is asleep");
    this.name = "TeslaAsleepError";
  }
}

/**
 * @param allowWake  send wake_up when the car answers 408.
 *
 *   Defaults to FALSE, and that default is the single most important line in
 *   this file for battery life. Tesla answers vehicle_data with 408 while the
 *   car is asleep; this function used to respond by POSTing wake_up and
 *   retrying. That made every read a wake — so opening any screen pulled a
 *   parked car out of deep sleep, no matter how carefully the client avoided
 *   polling. Reducing the interval could never fix that, because the interval
 *   was never the mechanism.
 *
 *   Only a deliberate act by the driver passes true: the wake endpoint behind
 *   the "wake the car" row, and a command, which is meaningless against a
 *   sleeping car.
 */
export class TeslaBudgetError extends Error {
  constructor(readonly used: number, readonly limit: number) {
    super(`daily read budget spent (${used}/${limit})`);
    this.name = "TeslaBudgetError";
  }
}

export async function fetchVehicleData(params: {
  vehicleId: string;
  userId: string;
  teslaVehicleId: number;
  displayName: string;
  /**
   * Why this call is happening. Required, and deliberately not defaulted: the
   * policy that kept the car asleep used to live in the client hooks, and two
   * paths walked straight past it — a redesign where every screen forgot the
   * poll argument, and /api/trip-plan, which reads the car server-side on every
   * plan and no hook can see. A caller that has to name its reason is a caller
   * that has thought about whether it should be calling at all.
   */
  reason: CallReason;
  allowWake?: boolean;
}): Promise<VehicleState> {
  // A reading from the last half-minute answers everything except a driver
  // asking for a fresh one. This is what makes ten re-plans, three screens and
  // two open tabs cost one call to the car instead of sixteen.
  if (params.reason !== "user-action") {
    const hit = await cachedRead<VehicleState>(params.vehicleId);
    if (hit) return hit;
  }

  // Counted before the request, so a burst cannot slip through between the
  // check and the send. Deliberate actions are counted and never refused.
  const budget = await chargeReadBudget(params.vehicleId, params.reason);
  if (!budget.allowed) throw new TeslaBudgetError(budget.used, budget.limit);

  const { accessToken, region } = await getValidAccessToken(params.vehicleId, params.userId);

  const url = `${baseUrl(region)}/api/1/vehicles/${params.teslaVehicleId}/vehicle_data?endpoints=${encodeURIComponent(TESLA_VEHICLE_DATA_ENDPOINTS)}`;

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  await recordTeslaCall("read");

  // 408 means asleep. Waking it is now something the driver asks for, not
  // something a page load does on their behalf.
  if (res.status === 408) {
    // allowWake alone is not enough: the reason has to agree, so a caller
    // cannot pass true out of habit on a path that is not a wake.
    if (!params.allowWake || params.reason !== "wake") throw new TeslaAsleepError();

    await recordTeslaCall("wake");
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
    await recordTeslaCall("read");
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
  const state = mapVehicleData(json, params);
  // Shared with every other caller for the next half-minute. Best-effort: a
  // cache that cannot be written is a slower app, not a broken one.
  await storeRead(params.vehicleId, state);
  return state;
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
  const config = r.vehicle_config ?? null;

  return {
    // identity
    vehicleId: params.vehicleId,
    displayName: r.display_name ?? params.displayName,
    brand: "tesla",
    dataSource: "live",
    trimBadge: config?.trim_badging ? trimKey(config) : null,
    // connectivity
    isOnline: r.state === "online",
    lastSeenAt: new Date().toISOString(),
    // energy
    batteryLevel: charge?.battery_level ?? null,
    batteryRangeKm: charge?.battery_range != null ? charge.battery_range * MILES_TO_KM : null,
    chargeLimit: charge?.charge_limit_soc ?? null,
    chargingState: mapChargingState(charge?.charging_state ?? "Disconnected"),
    chargingRateKw: charge?.charger_power ?? null,
    chargeAmps: charge?.charge_current_request ?? null,
    isChargePortOpen: charge?.charge_port_door_open ?? null,
    timeToFullMinutes: charge?.time_to_full_charge != null
      ? Math.round(charge.time_to_full_charge * 60)
      : null,
    // Live schedule readback not mapped yet (dormant adapter).
    scheduledChargingEnabled: null,
    scheduledChargingStartMinutes: null,
    scheduledDepartureEnabled: null,
    scheduledDepartureMinutes: null,
    batteryHealthPct: estimateSoH(charge, config)?.pct ?? null,
    batteryChemistry: batteryChemistry(config),
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
    isRemoteStartActive: veh?.remote_start ?? null,
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

  // Counted here, before the request leaves. A command is one of the three
  // things that reach the car and wake it — and the debug panel showed a
  // "commands" figure that was never incremented, so it read zero however many
  // were sent. A counter that only counts some of what it names is worse than
  // no counter: it makes the other numbers look trustworthy.
  await recordTeslaCall("command");

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
 * What a trim badge tells us about the car.
 *
 * `vehicle_config.trim_badging` is the car's own badge — `p74d` for a Model 3
 * Performance, `74d` for a Long Range — and it is authoritative in a way the
 * VIN is not: the VIN's model character gives the line and its body character
 * gives the shell, and neither says which drivetrain or which pack is fitted.
 *
 * **Chemistry is the field worth having.** It changes daily advice completely
 * and in opposite directions. An NMC/NCA pack wants to spend its life between
 * about 50 and 80 per cent and dislikes sitting full; an LFP pack wants taking
 * to 100 per cent regularly, because that is how its BMS recalibrates and it
 * does not mind the time there. Advice built on the wrong one is not vague, it
 * is backwards.
 *
 * Keyed on `car_type:trim_badging` so a Model Y cannot borrow a Model 3 figure.
 * Rated range is in EPA miles, the unit `battery_range` comes in.
 */
interface TrimFacts {
  ratedRangeMiles: number;
  chemistry: BatteryChemistry;
}

const TRIM_FACTS: Record<string, TrimFacts> = {
  "model3:p74d": { ratedRangeMiles: 315, chemistry: "nmc" }, // Performance
  "model3:74d": { ratedRangeMiles: 358, chemistry: "nmc" }, // Long Range AWD
};

/** The badge, normalised. Exported so one place decides how the key is built. */
export function trimKey(
  config: Partial<TeslaVehicleConfig> | null | undefined,
): string {
  return `${config?.car_type ?? ""}:${(config?.trim_badging ?? "").toLowerCase()}`;
}

/**
 * Which chemistry this car has, or null when its badge is not one we know.
 *
 * Null matters: advice for the wrong chemistry is worse than none, because the
 * two point in opposite directions. Better to say nothing than to tell an LFP
 * owner to avoid 100%, which is the one thing their pack actually wants.
 */
export function batteryChemistry(
  config: Partial<TeslaVehicleConfig> | null | undefined,
): BatteryChemistry | null {
  return chemistryForBadge(trimKey(config));
}

/**
 * The same answer from a stored badge instead of a live response.
 *
 * A parked Tesla is asleep most of the day, and a sleeping car is answered from
 * storage — which is why the badge is kept on the vehicle row. Without this the
 * chemistry advice appeared only in the minutes the car happened to be awake,
 * which reads as a broken feature rather than as a sleeping car.
 */
export function chemistryForBadge(badge: string | null | undefined): BatteryChemistry | null {
  return badge ? (TRIM_FACTS[badge]?.chemistry ?? null) : null;
}

export interface SoHEstimate {
  /** Range at 100%, in km, derived from the current reading. Checkable. */
  fullRangeKm: number;
  /** Percentage against the model's original, or null when the variant is unknown. */
  pct: number | null;
  /** What the percentage was measured against, so the claim can be argued with. */
  baselineKm: number | null;
}

/**
 * State of health, or nothing.
 *
 * The measurement is sound: at a known charge level, `battery_range` scaled to
 * 100% is what the pack can hold today. The comparison is where it goes wrong,
 * because the baseline depends on a trim the VIN cannot settle. A Model 3 RWD,
 * Long Range and Performance leave the factory at roughly 272, 358 and 315
 * rated miles — a spread of thirty per cent. Divide one car's measurement by
 * another trim's baseline and the answer is a confident percentage that is
 * wrong by a quarter.
 *
 * So the percentage appears only when the car's own badge is one we know, and
 * is `null` otherwise rather than falling back to an average of cars nobody
 * owns. The full-range estimate is returned either way, because it is the
 * honest half: a driver can hold it up against their own dash in one glance,
 * and a percentage against a guessed baseline they cannot check at all. That
 * is exactly how the last wrong baseline was caught.
 */
export function estimateSoH(
  charge: Partial<TeslaChargeState> | null,
  config: Partial<TeslaVehicleConfig> | null,
): SoHEstimate | null {
  if (!charge) return null;
  const { battery_level: soc, battery_range: rangeAtSoc } = charge;
  if (soc == null || rangeAtSoc == null) return null;
  // Below 15% the range estimate is dominated by the car's own reserve
  // modelling and stops being a proxy for capacity.
  if (soc <= 15) return null;

  const estimatedFullRangeMiles = rangeAtSoc / (soc / 100);
  const fullRangeKm = Math.round(estimatedFullRangeMiles * MILES_TO_KM);

  const key = trimKey(config);
  const ratedRange = TRIM_FACTS[key]?.ratedRangeMiles;
  // An unrecognised badge gets the measurement and no percentage. A percentage
  // against the wrong trim is wrong by a quarter, confidently, and a driver
  // cannot check it — whereas they can hold the full-range figure up against
  // their own dash, which is how the last wrong one was caught.
  if (ratedRange == null) return { fullRangeKm, pct: null, baselineKm: null };

  const soh = (estimatedFullRangeMiles / ratedRange) * 100;
  return {
    fullRangeKm,
    pct: Math.round(Math.min(105, Math.max(50, soh)) * 10) / 10,
    baselineKm: Math.round(ratedRange * MILES_TO_KM),
  };
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
