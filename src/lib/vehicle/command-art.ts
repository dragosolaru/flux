import type { CommandName } from "@/types/history";

/**
 * The picture a command earns when it lands.
 *
 * A command used to confirm itself with the words "Comandă trimisă", which is
 * true of every command and therefore tells you nothing about the one you
 * pressed. Showing the car in the state it just went into answers the question
 * a driver actually has — *did the thing I meant happen* — in the time it takes
 * to glance at the phone, which is all the attention this moment gets.
 *
 * Two rules keep the map honest:
 *
 * · **No picture is better than a wrong picture.** Only commands whose result
 *   the artwork genuinely depicts appear here. The charge port has no artwork
 *   of an open port — the nearest frame shows a cable plugged in, which says
 *   "charging" — so the port commands are deliberately absent and fall back to
 *   the plain toast.
 * · **The caption is a noun and its state**, never an imperative. `unlock`
 *   shows `Uși · Deblocate`, not `Deblochează` — by the time the card appears
 *   the door is already unlocked, and a label that still commands is a label
 *   that lies about when it is being read. Momentary actions with no resulting
 *   state (flash, remote start) carry the action name alone.
 */
export interface CommandArt {
  /** File in `public/car-states`, without the extension. */
  art: string;
  /** `commands` key naming the thing — "Uși", "Sentry", "Climă". */
  nameKey: string;
  /** `commands` key for the state it is now in. Absent for momentary actions. */
  stateKey?: string;
}

const COMMAND_ART: Partial<Record<CommandName, CommandArt>> = {
  lock: { art: "locked", nameKey: "name_doors", stateKey: "doors_locked" },
  unlock: { art: "unlocked", nameKey: "name_doors", stateKey: "doors_unlocked" },
  activate_sentry: { art: "sentry", nameKey: "name_sentry", stateKey: "sentry_state_on" },
  deactivate_sentry: { art: "parked", nameKey: "name_sentry", stateKey: "sentry_state_off" },
  climate_on: { art: "climate", nameKey: "name_climate", stateKey: "climate_state_on" },
  climate_off: { art: "parked", nameKey: "name_climate", stateKey: "climate_state_off" },
  precondition_max: {
    art: "climate",
    nameKey: "name_precondition",
    stateKey: "precondition_state_on",
  },
  start_charging: { art: "charging", nameKey: "name_charging", stateKey: "charging_state_on" },
  stop_charging: { art: "parked", nameKey: "name_charging", stateKey: "charging_state_off" },
  vent_windows: { art: "windows", nameKey: "name_windows", stateKey: "windows_state_open" },
  close_windows: { art: "parked", nameKey: "name_windows", stateKey: "windows_state_closed" },
  flash: { art: "headlights", nameKey: "flash" },
  remote_start: { art: "driving", nameKey: "remote_start" },
};

export function commandArt(command: CommandName): CommandArt | null {
  return COMMAND_ART[command] ?? null;
}
