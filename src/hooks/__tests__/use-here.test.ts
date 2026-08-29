import { describe, expect, it } from "vitest";

import { worthCommitting, type Fix } from "../useHere";

/**
 * The browser gives ten fixes a second in the car — measured, not assumed.
 * Committing all of them would be ten React renders a second for a picture
 * that does not change, so this is the policy that stands between a proven
 * capability and a hot phone.
 */
const at = (lat: number, lng: number, ms: number): Fix => ({
  lat,
  lng,
  accuracy: 2,
  at: ms,
});

// ~11.1 m per 0.0001° of latitude.
const NORTH_11M = 0.0001;

describe("worthCommitting", () => {
  it("always takes the first fix", () => {
    expect(worthCommitting(null, at(46.77, 23.59, 0))).toBe(true);
  });

  it("drops a fix that is neither newer nor further", () => {
    const last = at(46.77, 23.59, 0);
    // 100 ms later, standing still — the common case at 10 Hz.
    expect(worthCommitting(last, at(46.77, 23.59, 100))).toBe(false);
  });

  it("takes a fix that has moved far enough to see", () => {
    const last = at(46.77, 23.59, 0);
    expect(worthCommitting(last, at(46.77 + NORTH_11M, 23.59, 100))).toBe(true);
  });

  it("takes a fix that is old enough, even standing still", () => {
    // A crawl in traffic must not freeze the marker just because each step is
    // under the distance threshold.
    const last = at(46.77, 23.59, 0);
    expect(worthCommitting(last, at(46.77, 23.59, 1600))).toBe(true);
  });

  it("keeps up with a car at speed", () => {
    // 100 km/h is 27.8 m/s, so the 8 m threshold falls in under 300 ms —
    // comfortably inside the ~100 ms the browser actually delivers.
    const last = at(46.77, 23.59, 0);
    const after300ms = at(46.77 + NORTH_11M * 0.75, 23.59, 300);
    expect(worthCommitting(last, after300ms)).toBe(true);
  });
});
