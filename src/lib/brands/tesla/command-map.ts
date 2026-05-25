import type { TeslaCommand } from "@/types/tesla";
import type { CommandName } from "@/types/history";

type CommandEntry = {
  teslaCmd: TeslaCommand;
  buildBody: (args: Record<string, unknown> | null) => Record<string, unknown> | undefined;
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
  vent_windows:      { teslaCmd: "window_control",         buildBody: () => ({ command: "vent",  lat: 0, lon: 0 }) },
  close_windows:     { teslaCmd: "window_control",         buildBody: () => ({ command: "close", lat: 0, lon: 0 }) },
  activate_sentry:   { teslaCmd: "set_sentry_mode",        buildBody: () => ({ on: true }) },
  deactivate_sentry: { teslaCmd: "set_sentry_mode",        buildBody: () => ({ on: false }) },
  remote_start:      { teslaCmd: "remote_start_drive",     buildBody: () => undefined },
  schedule_charging: {
    teslaCmd: "set_scheduled_charging",
    buildBody: (args) => ({ enable: true, time: Number(args?.time ?? 0) }),
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
      end_off_peak_time: 360,
    }),
  },
  precondition_max: {
    teslaCmd: "set_preconditioning_max",
    buildBody: (args) => ({ on: args?.on !== false }),
  },
};
