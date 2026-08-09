import type { TeslaCommand } from "@/types/tesla";
import type { CommandName } from "@/types/history";

type CommandEntry = {
  teslaCmd: TeslaCommand;
  buildBody: (args: Record<string, unknown> | null) => Record<string, unknown> | undefined;
};

function windowBody(command: "vent" | "close", args: Record<string, unknown> | null) {
  const lat = Number(args?.lat);
  const lon = Number(args?.lng ?? args?.lon);
  return {
    command,
    lat: Number.isFinite(lat) ? lat : 0,
    lon: Number.isFinite(lon) ? lon : 0,
  };
}

export const TESLA_COMMAND_MAP: Partial<Record<CommandName, CommandEntry>> = {
  lock:             { teslaCmd: "door_lock",              buildBody: () => undefined },
  unlock:           { teslaCmd: "door_unlock",             buildBody: () => undefined },
  honk:             { teslaCmd: "honk_horn",               buildBody: () => undefined },
  flash:            { teslaCmd: "flash_lights",            buildBody: () => undefined },
  climate_on:       { teslaCmd: "auto_conditioning_start", buildBody: () => undefined },
  climate_off:      { teslaCmd: "auto_conditioning_stop",  buildBody: () => undefined },
  set_climate_temp: {
    teslaCmd: "set_temps",
    buildBody: (args) => {
      const temp = Number(args?.temp ?? 21);
      return { driver_temp: temp, passenger_temp: temp };
    },
  },
  set_charge_limit: {
    teslaCmd: "set_charge_limit",
    buildBody: (args) => ({ percent: Number(args?.percent ?? 80) }),
  },
  set_charge_amps: {
    teslaCmd: "set_charging_amps",
    buildBody: (args) => ({ charging_amps: Number(args?.amps ?? 16) }),
  },
  start_charging:    { teslaCmd: "charge_start",           buildBody: () => undefined },
  stop_charging:     { teslaCmd: "charge_stop",            buildBody: () => undefined },
  open_charge_port:  { teslaCmd: "charge_port_door_open",  buildBody: () => undefined },
  close_charge_port: { teslaCmd: "charge_port_door_close", buildBody: () => undefined },
  // lat/lon are a proximity check, not telemetry: Tesla closes the windows only
  // for someone near the car. 0,0 passes for `vent` and fails for `close`,
  // which is why venting worked and closing did not. The caller passes the
  // car's own position when it has one; 0,0 stays as the fallback so venting
  // still works before any location has been reported.
  vent_windows:      { teslaCmd: "window_control",         buildBody: (args) => windowBody("vent", args) },
  close_windows:     { teslaCmd: "window_control",         buildBody: (args) => windowBody("close", args) },
  activate_sentry:   { teslaCmd: "set_sentry_mode",        buildBody: () => ({ on: true }) },
  deactivate_sentry: { teslaCmd: "set_sentry_mode",        buildBody: () => ({ on: false }) },
  remote_start:      { teslaCmd: "remote_start_drive",     buildBody: () => undefined },
  schedule_charging: {
    teslaCmd: "set_scheduled_charging",
    buildBody: (args) => ({ enable: args?.enable !== false, time: Number(args?.time ?? 0) }),
  },
  schedule_departure: {
    teslaCmd: "set_scheduled_departure",
    buildBody: (args) => ({
      enable: true,
      departure_time: Number(args?.time ?? 480),
      preconditioning_enabled: true,
      preconditioning_weekdays_only: false,
      off_peak_charging_enabled: args?.offPeak ?? false,
      off_peak_charging_weekdays_only: false,
      end_off_peak_time: Number(args?.endOffPeakTime ?? 360),
    }),
  },
  precondition_max: {
    teslaCmd: "set_preconditioning_max",
    buildBody: (args) => ({ on: args?.on !== false }),
  },
  // Send the next waypoint (first charging stop, or the destination if the trip
  // needs no stops) to the car's nav — Fleet API navigation_gps_request takes a
  // single GPS target, so the driver navigates stop-by-stop. Tesla auto-
  // preconditions the battery when navigating to a Supercharger; the UI flags
  // non-SC fast stops for a manual precondition.
  share_navigation: {
    teslaCmd: "navigation_gps_request",
    buildBody: (args) => {
      const rawStops = Array.isArray(args?.stops) ? args.stops : [];
      const stops = rawStops
        .map(toWaypoint)
        .filter((w): w is Waypoint => w !== null);
      const next = stops[0] ?? toWaypoint(args?.destination ?? null);
      if (!next) return undefined;
      return { lat: next.lat, lon: next.lng, order: 0 };
    },
  },
};

interface Waypoint {
  lat: number;
  lng: number;
}

function toWaypoint(value: unknown): Waypoint | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.lat !== "number" || typeof o.lng !== "number") return null;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
  return { lat: o.lat, lng: o.lng };
}
