import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { vehicleQueryPrefix } from "../useVehicle";

/**
 * One vehicle's state lives under more than one cache key — a live read and a
 * cached-only one — and everything that writes to that cache has to agree with
 * everything that reads it.
 *
 * They stopped agreeing the moment the read key gained a third element: the
 * command hook still wrote to `["vehicle", id]`, so every optimistic update
 * landed in an entry no screen was observing. Unlocking the car left the row
 * saying LOCKED, which is the worst possible failure for a control that is
 * supposed to tell you what the car is doing.
 *
 * Asserted against the source because the failure is not "the code is wrong"
 * but "a second place forgot" — and a second place is exactly what a shared
 * helper prevents.
 */
const SRC = join(process.cwd(), "src");

function read(relative: string): string {
  return readFileSync(join(SRC, relative), "utf8");
}

describe("vehicle state cache keys", () => {
  it("the prefix is what the read key starts with", () => {
    expect(vehicleQueryPrefix("abc")).toEqual(["vehicle", "abc"]);
    expect(read("hooks/useVehicle.ts")).toContain(
      "queryKey: [...vehicleQueryPrefix(vehicleId), cachedOnly ? \"cached\" : \"live\"]",
    );
  });

  it("the command hook builds no vehicle key of its own", () => {
    const commands = read("hooks/useVehicleCommand.tsx");
    expect(commands).toContain("vehicleQueryPrefix");
    // The literal is what drifted. Any reintroduction of it is the same bug.
    expect(commands).not.toMatch(/\["vehicle",\s*\w+\]/);
  });

  it("the optimistic patch reaches every matching entry, not one key", () => {
    const commands = read("hooks/useVehicleCommand.tsx");
    // setQueryData targets one exact key; setQueriesData matches the prefix.
    expect(commands).toContain("setQueriesData");
    expect(commands).toContain("getQueriesData");
  });

  it("a successful command refreshes the vehicle list too", () => {
    // virtual_key_paired lives on the list, and the server flips it on the
    // command's outcome. Without this the pairing prompt survived pairing.
    expect(read("hooks/useVehicleCommand.tsx")).toContain('queryKey: ["vehicles"]');
  });
});
