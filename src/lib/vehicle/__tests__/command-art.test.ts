import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { commandArt } from "../command-art";
import type { CommandName } from "@/types/history";

describe("commandArt", () => {
  it("shows the state the car is now in, not the button that was pressed", () => {
    // By the time the card appears the door is already unlocked. A caption that
    // still commands is a caption that lies about when it is being read — the
    // same failure that got the toggle labels rewritten.
    expect(commandArt("unlock")).toEqual({
      art: "unlocked",
      nameKey: "name_doors",
      stateKey: "doors_unlocked",
    });
    expect(commandArt("lock")?.stateKey).toBe("doors_locked");
  });

  it("has no picture for a result the artwork does not depict", () => {
    // The nearest frame to an open charge port shows a cable plugged in, which
    // says "charging". No picture is better than a wrong one, so these fall
    // back to the plain toast.
    expect(commandArt("open_charge_port")).toBeNull();
    expect(commandArt("close_charge_port")).toBeNull();
    expect(commandArt("honk")).toBeNull();
    expect(commandArt("set_charge_limit")).toBeNull();
  });

  it("carries the action name alone for a momentary action", () => {
    // A light flash leaves the car in no new state, so there is nothing for a
    // state word to say.
    expect(commandArt("flash")?.stateKey).toBeUndefined();
    expect(commandArt("remote_start")?.stateKey).toBeUndefined();
  });

  it("every mapped command points at a file that exists", () => {
    // The art name is a string used to build a URL, so a typo fails silently as
    // a broken image inside a toast that is gone in two seconds.
    const commands: CommandName[] = [
      "lock", "unlock", "activate_sentry", "deactivate_sentry",
      "climate_on", "climate_off", "precondition_max",
      "start_charging", "stop_charging", "vent_windows", "close_windows",
      "flash", "remote_start",
    ];
    for (const command of commands) {
      const art = commandArt(command);
      expect(art, command).not.toBeNull();
      expect(
        existsSync(join(process.cwd(), "public/car-states", `${art!.art}.webp`)),
        `${command} → ${art!.art}.webp`,
      ).toBe(true);
    }
  });
});
