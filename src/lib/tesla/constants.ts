import type { TeslaRegion } from "@/types/tesla";

export const TESLA_REGIONS: Record<TeslaRegion, string> = {
  eu: "https://fleet-api.prd.eu.vn.cloud.tesla.com",
  na: "https://fleet-api.prd.na.vn.cloud.tesla.com",
  cn: "https://fleet-api.prd.cn.vn.cloud.tesla.cn",
};

export const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
export const TESLA_TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";

export const TESLA_SCOPES = [
  "openid",
  "offline_access",
  "vehicle_device_data",
  "vehicle_cmds",
  "vehicle_charging_cmds",
].join(" ");

export const TESLA_VEHICLE_DATA_ENDPOINTS = [
  "charge_state",
  "climate_state",
  "drive_state",
  "vehicle_state",
].join(";");

export const MILES_TO_KM = 1.609344;
