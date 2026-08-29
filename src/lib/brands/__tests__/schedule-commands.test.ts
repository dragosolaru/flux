import { describe, expect, it } from "vitest";

import { TESLA_COMMAND_MAP } from "@/lib/brands/tesla/command-map";

/**
 * The bodies Tesla's own proxy will accept, transcribed rather than inferred.
 *
 * Every parameter name here comes from `pkg/proxy/command.go` in
 * teslamotors/vehicle-command — the file that parses and rejects these
 * requests. It is the only source worth copying from, and the reason to copy
 * rather than reason is on record in this repo: the last command written from a
 * guess about what its name implied turned on Max Defrost every time a driver
 * sent a destination to the car.
 */
function build(
  cmd: keyof typeof TESLA_COMMAND_MAP,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const entry = TESLA_COMMAND_MAP[cmd];
  if (!entry?.buildBody) throw new Error(`${cmd} builds no body`);
  return entry.buildBody(args) as Record<string, unknown>;
}

describe("schedule commands", () => {
  it("sends lat/lon under the names Tesla parses", () => {
    // Ours is `lng`, Tesla's is `lon`. A silent rename is the whole reason a
    // mapping layer exists.
    const body = build("add_precondition_schedule", { lat: 46.77, lng: 23.59, time: 480 });
    expect(body.lat).toBe(46.77);
    expect(body.lon).toBe(23.59);
    expect(body).not.toHaveProperty("lng");
  });

  it("carries the preconditioning time as minutes past midnight", () => {
    expect(build("add_precondition_schedule", { lat: 1, lng: 2, time: 480 }).precondition_time)
      .toBe(480);
  });

  it("enables each end of a charge window only when that end was given", () => {
    // start_enabled and end_enabled are separate booleans in Tesla's parser, so
    // "charge from 23:00" and "charge until 07:00" are expressible separately.
    const fromOnly = build("add_charge_schedule", { lat: 1, lng: 2, startTime: 1380 });
    expect(fromOnly.start_enabled).toBe(true);
    expect(fromOnly.end_enabled).toBe(false);

    const untilOnly = build("add_charge_schedule", { lat: 1, lng: 2, endTime: 420 });
    expect(untilOnly.start_enabled).toBe(false);
    expect(untilOnly.end_enabled).toBe(true);
  });

  it("defaults to every day, and enabled", () => {
    const body = build("add_charge_schedule", { lat: 1, lng: 2, startTime: 0 });
    expect(body.days_of_week).toBe("ALL");
    expect(body.enabled).toBe(true);
    expect(body.one_time).toBe(false);
  });

  it("omits id when none is given, so Tesla assigns one", () => {
    // Tesla defaults it to the current unix second. Sending id: 0 would be a
    // real id, and a wrong one.
    expect(build("add_charge_schedule", { lat: 1, lng: 2 })).not.toHaveProperty("id");
    expect(build("add_charge_schedule", { lat: 1, lng: 2, id: 7 }).id).toBe(7);
  });

  it("removes by id alone", () => {
    expect(build("remove_precondition_schedule", { id: 42 })).toEqual({ id: 42 });
  });
});
