import type { TeslaCommand } from "@/types/tesla";
import type { CommandName } from "@/types/history";

type CommandEntry = {
  teslaCmd: TeslaCommand;
  buildBody: (args: Record<string, unknown> | null) => Record<string, unknown> | undefined;
  /**
   * Set false for commands the signing proxy does not implement, so they are
   * sent straight to Tesla's REST endpoint instead of being rejected locally
   * with `400 invalid_command`. Signed is the default and the safe one.
   */
  signed?: false;
};

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
  // lat/lon are Tesla's proximity interlock on the REST endpoint: it closes the
  // windows only for a caller near the car. Constant 0,0 on purpose.
  //
  // Passing the car's own position made the interlock pass unconditionally, and
  // the coordinates came from `args`, which is caller-controlled — so the app
  // was supplying an attestation on behalf of someone who might be anywhere.
  // It bought nothing: through the signing proxy the fields are ignored
  // outright (pkg/proxy/command.go reads only `command`), and on the direct
  // path defeating the interlock is the whole problem. Let Tesla enforce it.
  vent_windows:      { teslaCmd: "window_control",         buildBody: () => ({ command: "vent",  lat: 0, lon: 0 }) },
  close_windows:     { teslaCmd: "window_control",         buildBody: () => ({ command: "close", lat: 0, lon: 0 }) },
  activate_sentry:   { teslaCmd: "set_sentry_mode",        buildBody: () => ({ on: true }) },
  deactivate_sentry: { teslaCmd: "set_sentry_mode",        buildBody: () => ({ on: false }) },
  remote_start:      { teslaCmd: "remote_start_drive",     buildBody: () => undefined },
  /**
   * The schedule pair Tesla says to prefer from firmware 2024.26.
   *
   * Every parameter name and its optionality is transcribed from Tesla's own
   * proxy — teslamotors/vehicle-command pkg/proxy/command.go — rather than
   * inferred. That file is the thing that will reject the request, so it is the
   * only source worth copying from. The last command written from a guess about
   * what its name implied turned on Max Defrost.
   *
   * Both are bound to a PLACE. A schedule fires when the car is parked at
   * lat/lon, which is why "precondition at 08:00" is a property of your drive
   * rather than a command you send at 07:30.
   *
   * `days_of_week` is a comma-separated list of day names, or the words ALL
   * and WEEKDAYS. Times are minutes past local midnight, like the old pair.
   * `id` is optional and Tesla defaults it to the current unix second; we send
   * it explicitly so a schedule can be replaced instead of duplicated.
   */
  add_charge_schedule: {
    teslaCmd: "add_charge_schedule",
    buildBody: (args) => ({
      lat: Number(args?.lat ?? 0),
      lon: Number(args?.lng ?? 0),
      days_of_week: String(args?.days ?? "ALL"),
      // The window is a start, an end, or both — each with its own enable, so
      // "charge from 23:00" and "charge until 07:00" are different schedules.
      start_time: Number(args?.startTime ?? 0),
      start_enabled: args?.startTime != null,
      end_time: Number(args?.endTime ?? 0),
      end_enabled: args?.endTime != null,
      enabled: args?.enabled !== false,
      one_time: args?.oneTime === true,
      ...(args?.id != null ? { id: Number(args.id) } : {}),
    }),
  },
  add_precondition_schedule: {
    teslaCmd: "add_precondition_schedule",
    buildBody: (args) => ({
      lat: Number(args?.lat ?? 0),
      lon: Number(args?.lng ?? 0),
      precondition_time: Number(args?.time ?? 0),
      days_of_week: String(args?.days ?? "ALL"),
      enabled: args?.enabled !== false,
      one_time: args?.oneTime === true,
      ...(args?.id != null ? { id: Number(args.id) } : {}),
    }),
  },
  remove_charge_schedule: {
    teslaCmd: "remove_charge_schedule",
    buildBody: (args) => ({ id: Number(args?.id ?? 0) }),
  },
  remove_precondition_schedule: {
    teslaCmd: "remove_precondition_schedule",
    buildBody: (args) => ({ id: Number(args?.id ?? 0) }),
  },
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
  //
  // `signed: false` because the signing proxy has no case for this command and
  // answers 400 locally, never forwarding it. Verified in
  // teslamotors/vehicle-command pkg/proxy/command.go.
  share_navigation: {
    teslaCmd: "navigation_gps_request",
    signed: false,
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
