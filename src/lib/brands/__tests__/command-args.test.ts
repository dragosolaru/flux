// One argument name per command, across every consumer.
//
// `args` is `Record<string, unknown>` from the button to the Tesla request
// body, so a UI sending `{limitPct: 95}` to a builder reading `args.percent`
// type-checks perfectly and fails silently at runtime. That happened: the
// charging screen sent `limitPct`, `TESLA_COMMAND_MAP` read `percent ?? 80`,
// and every live charge-limit change went to the car as 80% behind a success
// toast. The mock engine read `limitPct`, so the simulator agreed with the UI
// and the unit test agreed with the mock — three of the four consumers were
// consistent with each other and wrong about the car.
//
// This test asserts the two independent consumers of a given command's args
// respond to the SAME key: the Tesla body builder and the mock engine. Neither
// alone can catch a rename; together they pin the vocabulary.

import { describe, it, expect } from "vitest";

import { TESLA_COMMAND_MAP } from "../tesla/command-map";
import { applyCommand } from "@/lib/mock/engine";
import { getBrand } from "../registry";
import { createInitialSnapshot } from "@/lib/mock/seed";
import type { CommandName } from "@/types/history";

const tesla = getBrand("tesla")!;

function snapshot() {
  return createInitialSnapshot("veh-1", "Test", "tesla", "commuter", "Model 3");
}

/**
 * Commands whose args must mean the same thing on both sides, with the value
 * the mock is expected to store and where to read it back.
 */
const SHARED_ARGS: {
  command: CommandName;
  args: Record<string, unknown>;
  /** What TESLA_COMMAND_MAP should put on the wire. */
  teslaBody: Record<string, unknown>;
  /** What the mock engine should change, if anything. */
  mock?: (s: ReturnType<typeof snapshot>["state"]) => unknown;
  mockExpected?: unknown;
}[] = [
  {
    command: "set_charge_limit",
    args: { percent: 95 },
    teslaBody: { percent: 95 },
    mock: (s) => s.chargeLimit,
    mockExpected: 95,
  },
  {
    command: "set_climate_temp",
    args: { temp: 24 },
    teslaBody: { driver_temp: 24, passenger_temp: 24 },
  },
  {
    command: "set_charge_amps",
    args: { amps: 12 },
    teslaBody: { charging_amps: 12 },
  },
];

describe("command argument vocabulary", () => {
  it.each(SHARED_ARGS)("$command builds the Tesla body from the caller's args", (c) => {
    const entry = TESLA_COMMAND_MAP[c.command]!;
    expect(entry.buildBody(c.args)).toEqual(c.teslaBody);
  });

  // The failure mode is a builder that silently substitutes its default, which
  // looks identical to success. Sending a different value must produce a
  // different body.
  it("set_charge_limit does not fall back to its default when given a value", () => {
    const entry = TESLA_COMMAND_MAP.set_charge_limit!;
    expect(entry.buildBody({ percent: 95 })).not.toEqual(entry.buildBody(null));
  });

  it.each(SHARED_ARGS.filter((c) => c.mock))(
    "$command reaches the mock engine under the same key",
    (c) => {
      const prev = snapshot();
      const next = applyCommand(prev, c.command, c.args, tesla);
      expect(c.mock!(next.state)).toBe(c.mockExpected);
    },
  );
});
