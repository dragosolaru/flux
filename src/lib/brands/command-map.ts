// Shared mapping from a CommandName (in API/UI vocabulary) to the matching
// CommandCapabilities key on a BrandProfile. Used by both the simulator
// (engine.applyCommand) and the API capability gate (commands/route.ts) to
// keep the two in sync — single source of truth.

import type { CommandName } from "@/types/history";
import type { CommandCapabilities } from "./types";

export const COMMAND_CAP_MAP: Record<CommandName, keyof CommandCapabilities> = {
  lock:              "lock",
  unlock:            "unlock",
  climate_on:        "climateOn",
  climate_off:       "climateOff",
  set_climate_temp:  "setClimateTemp",
  honk:              "honk",
  flash:             "flash",
  set_charge_limit:  "setChargeLimit",
  set_charge_amps:   "setChargeAmps",
  start_charging:    "startCharging",
  stop_charging:     "stopCharging",
  open_charge_port:  "openChargePort",
  close_charge_port: "closeChargePort",
  vent_windows:      "ventWindows",
  close_windows:     "closeWindows",
  activate_sentry:    "activateSentry",
  deactivate_sentry:  "deactivateSentry",
  remote_start:       "remoteStart",
  schedule_charging:  "scheduleCharging",
  schedule_departure: "scheduleDeparture",
  precondition_max:   "preconditionMax",
  share_navigation:   "shareNavigation",
};
