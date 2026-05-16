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

export async function fetchVehicleData(params: {
  vehicleId: string;
  teslaVehicleId: number;
  displayName: string;
}): Promise<VehicleState> {
  const { accessToken, region } = await getValidAccessToken(params.vehicleId);

  const url = `${baseUrl(region)}/api/1/vehicles/${params.teslaVehicleId}/vehicle_data?endpoints=${encodeURIComponent(TESLA_VEHICLE_DATA_ENDPOINTS)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Tesla vehicle_data failed: ${res.status}`);
  }

  const json = (await res.json()) as TeslaVehicleDataResponse;
  const r = json.response;

  return {
    vehicleId: params.vehicleId,
    displayName: r.display_name ?? params.displayName,
    isOnline: r.state === "online",
    batteryLevel: r.charge_state.battery_level,
    batteryRangeKm: r.charge_state.battery_range * MILES_TO_KM,
    chargeLimit: r.charge_state.charge_limit_soc,
    chargingState: mapChargingState(r.charge_state.charging_state),
    chargingRateKw: r.charge_state.charger_power,
    timeToFullMinutes: Math.round(r.charge_state.time_to_full_charge * 60),
    odometerKm: r.vehicle_state.odometer * MILES_TO_KM,
    interiorTempC: r.climate_state.inside_temp,
    exteriorTempC: r.climate_state.outside_temp,
    isClimateOn: r.climate_state.is_climate_on,
    isLocked: r.vehicle_state.locked,
    isSentryMode: r.vehicle_state.sentry_mode,
    latitude: r.drive_state.latitude,
    longitude: r.drive_state.longitude,
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

  const url = `${baseUrl(region)}/api/1/vehicles/${params.teslaVehicleId}/command/${params.command}`;
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
    throw new Error(`Tesla command failed: ${res.status}`);
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
