import {
  MILES_TO_KM,
  TESLA_REGIONS,
  TESLA_VEHICLE_DATA_ENDPOINTS,
} from "./constants";
import { getValidAccessToken } from "./tokens";
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
    throw new Error(`Tesla vehicle_data ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as TeslaVehicleDataResponse;
  return mapVehicleData(json, params);
}

function mapVehicleData(
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
    motionState: null,
    odometerKm: veh?.odometer != null ? veh.odometer * MILES_TO_KM : null,
    speedKmh: null,
    headingDeg: drive?.heading ?? null,
    // location
    latitude: drive?.latitude ?? null,
    longitude: drive?.longitude ?? null,
    // climate
    interiorTempC: climate?.inside_temp ?? null,
    exteriorTempC: climate?.outside_temp ?? null,
    isClimateOn: climate?.is_climate_on ?? null,
    driverTempC: climate?.driver_temp_setting ?? null,
    passengerTempC: null,
    hvacMode: null,
    seatHeatingLevel: null,
    steeringHeating: null,
    // body / security
    isLocked: veh?.locked ?? null,
    doorsOpen: null,
    windowsOpen: null,
    isTrunkOpen: null,
    isFrunkOpen: null,
    isSentryMode: veh?.sentry_mode ?? null,
    isDashcamRecording: null,
    // Read from the car rather than hardcoded null. Flux could send
    // precondition_max but never show whether it took effect — the field was
    // written only by the simulator, so a linked car reported "unknown"
    // forever and the driver had no way to tell a working command from a
    // silently rejected one.
    isBatteryPreconditioning: climate?.battery_heater ?? climate?.battery_heater_on ?? null,
    // software
    softwareVersion: veh?.car_version ?? null,
    updateAvailable: null,
    updateVersionLabel: null,
    serviceDueAt: null,
    // tpms
    tirePressures: null,
    // scores
    safetyScore: null,
    efficiencyScore: null,
    // metadata
    recordedAt: new Date().toISOString(),
  };
}

export async function sendVehicleCommand(params: {
  vehicleId: string;
  userId: string;
  teslaVehicleId: number;
  command: TeslaCommand;
  body?: Record<string, unknown>;
}): Promise<TeslaCommandResponse> {
  const { accessToken, region } = await getValidAccessToken(params.vehicleId, params.userId);

  // For Model 3/Y/S/X post-2021 Tesla requires command signing via the
  // Vehicle Command Protocol. We delegate that to a self-hosted proxy
  // (the tesla-http-proxy Go binary). When TESLA_PROXY_BASE_URL is set,
  // route through the proxy; otherwise hit Tesla directly (works for
  // pre-2021 Model S/X and for cars where REST commands still pass).
  const proxyBase = process.env.TESLA_PROXY_BASE_URL?.replace(/\/$/, "");
  const apiBase = proxyBase || baseUrl(region);

  const url = `${apiBase}/api/1/vehicles/${params.teslaVehicleId}/command/${params.command}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
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
  charge: import("@/types/tesla").TeslaChargeState | null,
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
