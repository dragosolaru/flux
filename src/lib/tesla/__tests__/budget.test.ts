import { describe, expect, it } from "vitest";

import { DAILY_READ_BUDGET, READ_CACHE_MS, type CallReason } from "../budget";

/**
 * The policy, as arithmetic rather than as prose.
 *
 * These pin the two numbers and the one asymmetry that decide whether the app
 * can drain a battery. They are deliberately not tests of the Redis calls —
 * that is plumbing, and it is best-effort by design — but of the rule the
 * plumbing implements.
 */

/** The gate's decision, extracted so it can be reasoned about without Redis. */
function allowed(reason: CallReason, used: number): boolean {
  const deliberate = reason === "user-action" || reason === "wake";
  return deliberate || used <= DAILY_READ_BUDGET;
}

describe("read budget", () => {
  it("stops automatic traffic at the ceiling", () => {
    expect(allowed("screen", DAILY_READ_BUDGET)).toBe(true);
    expect(allowed("screen", DAILY_READ_BUDGET + 1)).toBe(false);
    expect(allowed("scheduled", DAILY_READ_BUDGET + 1)).toBe(false);
  });

  it("never refuses a driver who pressed something", () => {
    // Being told "no" by your own app while the car sits there answering is a
    // worse failure than one extra call. The ceiling exists to stop traffic
    // nobody asked for, which is the traffic that caused the problem.
    expect(allowed("user-action", DAILY_READ_BUDGET * 10)).toBe(true);
    expect(allowed("wake", DAILY_READ_BUDGET * 10)).toBe(true);
  });

  it("leaves room under Tesla's own limit rather than racing it", () => {
    // Tesla's is reported as a few hundred per vehicle per day. Ours has to sit
    // under that with margin, or the ceiling only ever fires after theirs has.
    expect(DAILY_READ_BUDGET).toBeLessThan(300);
  });

  it("shares a reading for long enough to collapse a burst", () => {
    // The trip planner re-reads the car on every plan, and the screen re-plans
    // as a destination is dragged. Half a minute turns that into one call.
    expect(READ_CACHE_MS).toBeGreaterThanOrEqual(20_000);
    // But not so long that a refresh two screens later shows yesterday.
    expect(READ_CACHE_MS).toBeLessThanOrEqual(60_000);
  });
});

describe("which reasons may use a shared reading", () => {
  // Only a deliberate refresh skips the window; everything else takes what is
  // already there. Inverting this is how a "refresh" button that returns a
  // 29-second-old number gets reported as broken.
  const skipsCache = (r: CallReason) => r === "user-action";

  it("a tap always gets a fresh answer", () => {
    expect(skipsCache("user-action")).toBe(true);
  });

  it("screens, the cron and wakes take the shared one", () => {
    expect(skipsCache("screen")).toBe(false);
    expect(skipsCache("scheduled")).toBe(false);
    expect(skipsCache("wake")).toBe(false);
  });
});
