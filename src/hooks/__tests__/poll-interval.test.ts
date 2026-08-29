import { describe, expect, it } from "vitest";

import { POLL_INTERVAL_MS, pollInterval } from "../useVehicle";

/**
 * A poll on a sleeping Tesla wakes it, and a car kept out of deep sleep loses
 * roughly ten times more charge per idle day. That makes this rule a battery
 * bill, not a preference — so it is pinned here rather than left to a comment.
 *
 * The regression these guard against is real: every screen of the /v2 redesign
 * shipped calling
 * `useVehicle(id, isLive)` without the third argument, so opening Commands or
 * the trip planner started a 30-second interval against a parked car.
 */
describe("pollInterval", () => {
  const base = { poll: true, live: true, active: true, status: "success" as const };

  it("polls when a screen asked to and nothing says otherwise", () => {
    expect(pollInterval(base)).toBe(POLL_INTERVAL_MS);
  });

  it("never polls when the screen did not ask", () => {
    expect(pollInterval({ ...base, poll: false })).toBe(false);
    // Not asking outranks everything else, including a healthy live car.
    expect(pollInterval({ ...base, poll: false, live: true, active: true })).toBe(false);
  });

  it("stops for a live car once polling is paused, by hand or by the idle timer", () => {
    expect(pollInterval({ ...base, active: false })).toBe(false);
  });

  it("keeps polling a simulator that has been paused — there is nothing to wake", () => {
    expect(pollInterval({ ...base, live: false, active: false })).toBe(POLL_INTERVAL_MS);
  });

  it("stops after a failure instead of retrying forever", () => {
    // Each retry still tries to wake the car, and no timer fixes a car that is
    // out of signal or unlinked.
    expect(pollInterval({ ...base, status: "error" })).toBe(false);
    expect(pollInterval({ ...base, status: "error", live: false })).toBe(false);
  });

  it("polls while the first fetch is still pending", () => {
    expect(pollInterval({ ...base, status: "pending" })).toBe(POLL_INTERVAL_MS);
  });
});
