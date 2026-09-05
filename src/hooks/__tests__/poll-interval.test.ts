import { describe, expect, it } from "vitest";

import { POLL_INTERVAL_MS, pollInterval } from "../useVehicle";

/**
 * What is left of the polling rule.
 *
 * The previous version of this file tested a rule about battery: a poll on a
 * sleeping Tesla woke it, a woken car lost roughly ten times more charge per
 * idle day, and so there was an app-wide sleep switch, a ten-minute idle
 * cut-off and a `live` flag marking which vehicles could be disturbed. Every
 * one of those cases protected a car this app no longer contacts, and testing
 * them now would be testing a hazard that cannot occur.
 *
 * Two behaviours survive because they are about the app, not the car.
 */
describe("pollInterval", () => {
  it("refreshes when the screen asked", () => {
    expect(pollInterval({ poll: true, status: "success" })).toBe(POLL_INTERVAL_MS);
  });

  it("does not refresh when the screen did not ask", () => {
    // The trip planner reads the battery once to plan from. Starting an
    // interval behind a screen that wanted one value is how background traffic
    // gets created by accident.
    expect(pollInterval({ poll: false, status: "success" })).toBe(false);
  });

  it("stops after a failure instead of retrying every thirty seconds forever", () => {
    // A read that failed will keep failing until something changes, and a timer
    // is not that something.
    expect(pollInterval({ poll: true, status: "error" })).toBe(false);
  });

  it("still refreshes while the first read is in flight", () => {
    expect(pollInterval({ poll: true, status: "pending" })).toBe(POLL_INTERVAL_MS);
  });
});
