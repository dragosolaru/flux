import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The rule this pins: nothing except the wake endpoint may pass `allowWake`.
 *
 * It is asserted against the source rather than by calling the function because
 * the failure mode is not "the code is wrong" but "a new call site forgot".
 * `fetchVehicleData` defaults `allowWake` to false, so a caller that forgets is
 * safe; the danger is the opposite — a caller that passes true because it was
 * copied from one that legitimately does.
 *
 * Background of the defect: vehicle_data answers 408 while the car sleeps, and
 * this function used to respond by POSTing wake_up and retrying. Every read was
 * therefore a wake, so opening any screen pulled a parked car out of deep sleep
 * however carefully the client avoided polling.
 */
const SRC = join(process.cwd(), "src");

function read(relative: string): string {
  return readFileSync(join(SRC, relative), "utf8");
}

describe("waking the car is opt-in", () => {
  it("fetchVehicleData does not wake unless asked", () => {
    const api = read("lib/tesla/api.ts");
    // The 408 branch must refuse before it reaches wakeVehicle.
    expect(api).toMatch(/if \(!params\.allowWake\) throw new TeslaAsleepError\(\);/);
    expect(api).toMatch(/allowWake\?: boolean;/);
  });

  it("the state route never passes allowWake", () => {
    const route = read("app/api/vehicles/[vehicleId]/state/route.ts");
    expect(route).toContain("fetchVehicleData(");
    // The assignment, not the word: the route names it in a comment explaining
    // why it is absent, and a test that cannot tell those apart would fail for
    // the documentation and pass for a real regression that used a different
    // spelling.
    expect(route).not.toMatch(/allowWake\s*:/);
  });

  it("only the wake endpoint passes allowWake", () => {
    const wake = read("app/api/vehicles/[vehicleId]/wake/route.ts");
    expect(wake).toContain("allowWake: true");
  });

  it("cached=1 answers from storage and never reaches for the car", () => {
    const route = read("app/api/vehicles/[vehicleId]/state/route.ts");
    // The branch must return BEFORE the live fetch, or "let it sleep" would
    // still contact the car — which is the entire promise the switch makes.
    const cachedBranch = route.indexOf("if (cachedOnly)");
    const liveFetch = route.indexOf("fetchVehicleData(");
    expect(cachedBranch).toBeGreaterThan(-1);
    expect(liveFetch).toBeGreaterThan(-1);
    expect(cachedBranch).toBeLessThan(liveFetch);
    expect(route).toContain("loadLastKnown");
  });

  it("the state route answers an asleep car from the last known reading", () => {
    const route = read("app/api/vehicles/[vehicleId]/state/route.ts");
    expect(route).toContain("TeslaAsleepError");
    expect(route).toContain("loadLastKnown");
    // And it stores each live reading, or there would be nothing to hand back
    // and the only way to answer would be to wake the car again.
    expect(route).toContain("saveLastKnown");
  });
});
