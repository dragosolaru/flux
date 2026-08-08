import type { TeslaRegion } from "@/types/tesla";

export const TESLA_REGIONS: Record<TeslaRegion, string> = {
  eu: "https://fleet-api.prd.eu.vn.cloud.tesla.com",
  na: "https://fleet-api.prd.na.vn.cloud.tesla.com",
  cn: "https://fleet-api.prd.cn.vn.cloud.tesla.cn",
};

export const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
export const TESLA_TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";

/**
 * Every scope the Fleet API offers.
 *
 * `vehicle_location` is the one that matters and the one that was missing.
 * Tesla split location out of `vehicle_device_data` in November 2024 and cut
 * location off for grants without it in January 2025 — so `drive_state` came
 * back with no latitude or longitude no matter how well the link worked.
 *
 * `energy_*` buys nothing today (Flux has no Powerwall or solar code); it is
 * here because the ask was for everything Tesla exposes. Drop those two lines
 * to stop asking.
 *
 * These must also be ticked on the app in Tesla's developer portal — the
 * authorize call fails outright on a scope the registration does not carry.
 */
export const TESLA_SCOPES = [
  "openid",
  "offline_access",
  "user_data",
  "vehicle_device_data",
  "vehicle_location",
  "vehicle_cmds",
  "vehicle_charging_cmds",
  "energy_device_data",
  "energy_cmds",
].join(" ");

/**
 * The client_credentials token used to register the partner account, kept
 * separate and deliberately narrow. It authenticates the app, not a driver, so
 * it gains nothing from the wider list — and widening it would make the
 * registration check in /debug start failing the moment the portal app is
 * missing one of the new scopes, which reads as "registration broke".
 */
export const TESLA_PARTNER_SCOPES = [
  "openid",
  "vehicle_device_data",
  "vehicle_cmds",
  "vehicle_charging_cmds",
].join(" ");

/**
 * `location_data` is a request-time opt-in on top of the scope: firmware
 * 2023.38+ omits position from `drive_state` unless it is named here. Both
 * halves are required, which is why location silently stayed null.
 */
export const TESLA_VEHICLE_DATA_ENDPOINTS = [
  "charge_state",
  "climate_state",
  "closures_state",
  "drive_state",
  "gui_settings",
  "location_data",
  "vehicle_config",
  "vehicle_state",
].join(";");

export const MILES_TO_KM = 1.609344;
