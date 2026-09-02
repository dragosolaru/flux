import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

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

/**
 * Every route that can reach Tesla consults the flag.
 *
 * The first version of this listed the routes by hand, and the list was wrong
 * within a day: it was built from a grep for four function names, so it missed
 * `/api/internal/debug/tesla-fleet-status` and `/api/internal/debug/tesla-partner`,
 * both of which call Tesla and neither of which checked anything. Being
 * admin-only made them feel exempt — but the admin is the person whose car is
 * linked, and `fleet_status` is billed like any other request.
 *
 * A hand-maintained list of "everything that touches X" goes stale exactly the
 * way `LAUNCH-CHECKLIST.md` did. So this one is derived: it walks the route
 * tree, finds every route importing from `@/lib/tesla/`, and requires the flag —
 * with an allowlist for the ones that provably reach no network.
 */
function routeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, found);
    else if (entry.name === "route.ts") found.push(full);
  }
  return found;
}

/**
 * Routes that import from `@/lib/tesla/` without calling Tesla: constants, the
 * Redis call log, and token decryption. Each is listed with why, so adding to
 * this list is a decision rather than a shrug.
 */
const NO_NETWORK = new Map([
  ["app/api/internal/debug/route.ts", "reads constants and the Redis call counters"],
  ["app/api/internal/debug/tesla-calls/route.ts", "reads the Redis call counters"],
  ["app/api/tesla/connection/route.ts", "decrypts a stored token, contacts nobody"],
]);

describe("every path that can reach Tesla consults the flag", () => {
  const apiDir = join(SRC, "app", "api");
  const touching = routeFiles(apiDir)
    .filter((f) => readFileSync(f, "utf8").includes('from "@/lib/tesla/'))
    .map((f) => relative(SRC, f).split(sep).join("/"));

  it("finds the routes to check", () => {
    // If this drops to nothing the sweep below passes vacuously.
    expect(touching.length).toBeGreaterThan(8);
  });

  for (const route of touching) {
    const exempt = NO_NETWORK.get(route);
    it(exempt ? `${route} is exempt — ${exempt}` : `${route} checks LIVE_INTEGRATIONS`, () => {
      if (exempt) return;
      expect(readFileSync(join(SRC, route), "utf8")).toContain("isLiveEnabled");
    });
  }
});
