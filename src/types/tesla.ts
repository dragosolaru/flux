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
  /**
   * What was actually granted, space-separated. The consent screen lets the
   * driver untick individual permissions, so this can be narrower than what we
   * asked for — never assume the request list came back.
   */
  scope?: string;
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
  /** The flap, not the cable: true while the port door is open. */
  charge_port_door_open?: boolean | null;
  /**
   * The current the driver asked for, which is what a UI should show — the
   * car reports `charge_amps` as the current it actually draws, and that is 0
   * whenever it is not charging.
   */
  charge_current_request?: number | null;
}

export interface TeslaClimateState {
  inside_temp: number; // celsius
  outside_temp: number;
  is_climate_on: boolean;
  driver_temp_setting: number;
  passenger_temp_setting?: number | null;
  /** 0–3. Tesla numbers the seats; index 0 is the driver. */
  seat_heater_left?: number | null;
  steering_wheel_heater?: boolean | null;
  /** "off" | "on" | "dog" | "camp" */
  climate_keeper_mode?: string | null;
  defrost_mode?: number | null;
  /**
   * Whether the battery heater is running — i.e. the car is preconditioning.
   *
   * Optional because Tesla omits it on some firmware and on a half-asleep
   * response. `battery_heater_on` is the older spelling and still appears;
   * both are read so a missing one is "unknown", never "off".
   */
  battery_heater?: boolean | null;
  battery_heater_on?: boolean | null;
}

export interface TeslaDriveState {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number | null; // mph, null when parked
  /** "P" | "D" | "R" | "N", null when the car is asleep. */
  shift_state?: string | null;
}

export interface TeslaSoftwareUpdate {
  status?: string | null;
  version?: string | null;
  download_perc?: number | null;
  install_perc?: number | null;
}

/**
 * What the car says it is. We have been requesting `vehicle_config` in
 * `TESLA_VEHICLE_DATA_ENDPOINTS` all along and never reading it, while
 * guessing the variant from the VIN — badly, and in a way the VIN cannot
 * settle.
 */
export interface TeslaVehicleConfig {
  /** "model3", "modely", "models", "modelx". */
  car_type?: string | null;
  /** "p74d" (Performance), "74d" (Long Range), "50", … — the car's own badge. */
  trim_badging?: string | null;
}

export interface TeslaVehicleState {
  locked: boolean;
  odometer: number; // miles
  sentry_mode: boolean;
  car_version: string;
  /**
   * Openings. Tesla reports these as numbers where 0 is closed, not booleans,
   * and names them by side: d = driver, p = passenger, f = front, r = rear.
   * `ft`/`rt` are the frunk and the boot.
   */
  df?: number | null;
  dr?: number | null;
  pf?: number | null;
  pr?: number | null;
  ft?: number | null;
  rt?: number | null;
  fd_window?: number | null;
  fp_window?: number | null;
  rd_window?: number | null;
  rp_window?: number | null;
  /** Bar, not kPa — around 2.9 on a correctly inflated tyre. */
  tpms_pressure_fl?: number | null;
  tpms_pressure_fr?: number | null;
  tpms_pressure_rl?: number | null;
  tpms_pressure_rr?: number | null;
  /** True during the two-minute window opened by remote_start_drive. */
  remote_start?: boolean | null;
  /** "Recording" | "Unavailable" */
  dashcam_state?: string | null;
  software_update?: TeslaSoftwareUpdate | null;
}

export interface TeslaVehicleDataResponse {
  response: {
    id: number;
    vehicle_id: number;
    vin: string;
    display_name: string;
    state: TeslaVehicleSummary["state"];
    // Sub-objects can be omitted when the car is asleep or partly responsive.
    charge_state?: Partial<TeslaChargeState> | null;
    climate_state?: Partial<TeslaClimateState> | null;
    drive_state?: Partial<TeslaDriveState> | null;
    vehicle_config?: Partial<TeslaVehicleConfig> | null;
    vehicle_state?: Partial<TeslaVehicleState> | null;
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
  | "set_charge_limit"
  | "set_charging_amps"
  | "charge_start"
  | "charge_stop"
  | "charge_port_door_open"
  | "charge_port_door_close"
  | "window_control"
  | "set_sentry_mode"
  | "remote_start_drive"
  | "set_temps"
  | "set_scheduled_charging"
  | "set_scheduled_departure"
  | "add_charge_schedule"
  | "add_precondition_schedule"
  | "remove_charge_schedule"
  | "remove_precondition_schedule"
  | "set_preconditioning_max"
  | "navigation_gps_request";
