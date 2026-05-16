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
  teslaVehicleId: number;
  displayName: string;
}): Promise<VehicleState> {
  const { accessToken, region } = await getValidAccessToken(params.vehicleId);

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
    vehicleId: params.vehicleId,
    displayName: r.display_name ?? params.displayName,
    isOnline: r.state === "online",
    batteryLevel: charge?.battery_level ?? 0,
    batteryRangeKm: (charge?.battery_range ?? 0) * MILES_TO_KM,
    chargeLimit: charge?.charge_limit_soc ?? 80,
    chargingState: mapChargingState(charge?.charging_state ?? "Disconnected"),
    chargingRateKw: charge?.charger_power ?? 0,
    timeToFullMinutes: Math.round((charge?.time_to_full_charge ?? 0) * 60),
    odometerKm: (veh?.odometer ?? 0) * MILES_TO_KM,
    interiorTempC: climate?.inside_temp ?? 0,
    exteriorTempC: climate?.outside_temp ?? 0,
    isClimateOn: climate?.is_climate_on ?? false,
    isLocked: veh?.locked ?? true,
    isSentryMode: veh?.sentry_mode ?? false,
    latitude: drive?.latitude ?? 0,
    longitude: drive?.longitude ?? 0,
    recordedAt: new Date().toISOString(),
  };
}

export async function sendVehicleCommand(params: {
  vehicleId: string;
  teslaVehicleId: number;
  command: TeslaCommand;
  body?: Record<string, unknown>;
}): Promise<TeslaCommandResponse> {
  const { accessToken, region } = await getValidAccessToken(params.vehicleId);

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
