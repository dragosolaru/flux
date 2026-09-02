import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A linked car whose integration is switched off must never be answered by the
 * simulator.
 *
 * Every route that talks to a car is written as
 * `if (isLiveEnabled(brand) && data_source === "live") { …reach the car… }`
 * and then falls through to the mock path. That shape is fine while the flag is
 * up and dangerous the moment it comes down, which is exactly what pausing the
 * Tesla integration does:
 *
 * · `/api/vehicles/[id]/state` would reach `createInitialSnapshot` and **invent
 *   a vehicle**, showing a fabricated battery level to the owner of a real car.
 * · `/api/vehicles/[id]/commands` would apply the command to that invented
 *   snapshot and answer "locked" while nothing left the building.
 *
 * Both are the same failure this codebase keeps meeting — a confident answer
 * that is not true — and neither would throw, log, or look wrong in review.
 * So the guard is pinned here rather than trusted to survive the next edit.
 */
const SRC = join(process.cwd(), "src");

function read(relative: string): string {
  return readFileSync(join(SRC, relative), "utf8");
}

describe("a live vehicle with its integration switched off", () => {
  it("is checked before the live branch in the state route", () => {
    const route = read("app/api/vehicles/[vehicleId]/state/route.ts");
    const guard = route.indexOf("isLiveVehicleDormant");
    const liveBranch = route.indexOf("isLiveEnabled(vehicle.brand)");
    expect(guard).toBeGreaterThan(-1);
    // Order is the whole point: after the live branch it would never run for
    // the case it exists to catch.
    expect(guard).toBeLessThan(liveBranch);
  });

  it("is checked before the live branch in the commands route", () => {
    const route = read("app/api/vehicles/[vehicleId]/commands/route.ts");
    const guard = route.indexOf("isLiveVehicleDormant");
    const liveBranch = route.indexOf("isLiveEnabled(vehicle.brand)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(liveBranch);
  });

  it("is refused outright by commands rather than handed to the simulator", () => {
    // A command that silently succeeds against an invented car is worse than an
    // error: the driver walks away believing the doors are locked.
    expect(read("app/api/vehicles/[vehicleId]/commands/route.ts")).toContain("LIVE_PAUSED");
  });
});

describe("every path that can reach Tesla consults the flag", () => {
  // The list is the point. When a new route calls into src/lib/tesla/api.ts it
  // belongs here, because "no queries and no costs" is a claim about all of
  // them at once — one unchecked endpoint makes it false.
  const routes = [
    "app/api/vehicles/[vehicleId]/state/route.ts",
    "app/api/vehicles/[vehicleId]/commands/route.ts",
    "app/api/vehicles/[vehicleId]/wake/route.ts",
    "app/api/cron/poll-vehicles/route.ts",
    "app/api/trip-plan/route.ts",
    "app/api/tesla/connect/route.ts",
    "app/api/tesla/callback/route.ts",
    "app/api/tesla/refresh/route.ts",
    // This one checked only `data_source` and would have kept sending signed
    // commands — and being billed — with the integration switched off.
    "app/api/debug/nav-probe/route.ts",
  ];

  for (const route of routes) {
    it(`${route} checks LIVE_INTEGRATIONS`, () => {
      expect(read(route)).toContain("isLiveEnabled");
    });
  }
});
