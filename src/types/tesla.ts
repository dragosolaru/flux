// =============================================================================
// Raw Tesla Fleet API response shapes (subset we care about).
// =============================================================================

export interface TeslaTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: "Bearer";
  state?: string;
}

export interface TeslaVehicleListResponse {
  response: TeslaVehicleSummary[];
  count: number;
}

export interface TeslaVehicleSummary {
  id: number;
  vehicle_id: number;
  vin: string;
  display_name: string;
  state: "online" | "asleep" | "offline";
}

export interface TeslaChargeState {
  battery_level: number;
  battery_range: number; // miles
  charging_state: "Disconnected" | "Charging" | "Complete" | "Stopped" | "NoPower";
  charge_limit_soc: number;
  charger_power: number; // kW
  time_to_full_charge: number;
}

export interface TeslaClimateState {
  inside_temp: number; // celsius
  outside_temp: number;
  is_climate_on: boolean;
  driver_temp_setting: number;
}

export interface TeslaDriveState {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number | null;
}

export interface TeslaVehicleState {
  locked: boolean;
  odometer: number; // miles
  sentry_mode: boolean;
  car_version: string;
}

export interface TeslaVehicleDataResponse {
  response: {
    id: number;
    vehicle_id: number;
    vin: string;
    display_name: string;
    state: TeslaVehicleSummary["state"];
    // Sub-objects can be omitted when the car is asleep or partly responsive.
    charge_state?: TeslaChargeState | null;
    climate_state?: TeslaClimateState | null;
    drive_state?: Partial<TeslaDriveState> | null;
    vehicle_state?: TeslaVehicleState | null;
  };
}

export interface TeslaCommandResponse {
  response: {
    result: boolean;
    reason: string;
  };
}

export type TeslaRegion = "eu" | "na" | "cn";

export type TeslaCommand =
  | "door_lock"
  | "door_unlock"
  | "honk_horn"
  | "flash_lights"
  | "auto_conditioning_start"
  | "auto_conditioning_stop"
  | "set_charge_limit";
