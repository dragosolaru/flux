import { describe, expect, it } from "vitest";

/**
 * A site with four stalls arrives from the API as four chargers with the same
 * name, the same coordinates and the same power. Listed one per row it reads as
 * a broken list rather than as four bays — reported from the car, where
 * "iHunt · 110 M · 200 KW" appeared twice in a row, then "Renovatio · 400 M ·
 * 50 KW" twice, then "iHunt · 570 M · 22 KW" twice.
 *
 * The grouping rule lives in the chargers screen. This pins the rule itself,
 * because the two things it has to get right are not obvious: the key must be
 * coarse enough to catch one car park and fine enough not to swallow the next
 * operator down the road, and the survivor must be the best point at the site
 * rather than whichever the query returned first.
 */
type Point = { name: string | null; lat: number; lng: number; kw: number | null; confidence: number };

/** Three decimals of latitude is about 100 m — one car park, not one street. */
export function siteKey(p: Point): string {
  return `${p.name ?? "?"}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
}

export function bestOf(a: Point, b: Point): Point {
  if ((b.kw ?? 0) > (a.kw ?? 0)) return b;
  if ((b.kw ?? 0) === (a.kw ?? 0) && b.confidence > a.confidence) return b;
  return a;
}

const site = (over: Partial<Point> = {}): Point => ({
  name: "iHunt",
  lat: 46.769,
  lng: 23.591,
  kw: 200,
  confidence: 0.5,
  ...over,
});

describe("site grouping", () => {
  it("collapses two stalls at one site", () => {
    expect(siteKey(site())).toBe(siteKey(site({ confidence: 0.9 })));
  });

  it("keeps two operators at the same coordinates apart", () => {
    expect(siteKey(site())).not.toBe(siteKey(site({ name: "Renovatio e-charge" })));
  });

  it("keeps the same operator on a different street apart", () => {
    // ~1.1 km north. A chain with two sites in one town must stay two rows.
    expect(siteKey(site())).not.toBe(siteKey(site({ lat: 46.779 })));
  });

  it("tolerates the metres of drift between two feeds of one site", () => {
    // ~5 m. Sources disagree at this scale constantly; that must not split a site.
    expect(siteKey(site())).toBe(siteKey(site({ lat: 46.76904, lng: 23.59104 })));
  });

  it("keeps the strongest stall as the one the row opens", () => {
    expect(bestOf(site({ kw: 22 }), site({ kw: 200 })).kw).toBe(200);
  });

  it("breaks a power tie on confidence", () => {
    expect(bestOf(site({ confidence: 0.2 }), site({ confidence: 0.8 })).confidence).toBe(0.8);
  });

  it("does not demote a known power to an unknown one", () => {
    expect(bestOf(site({ kw: 50 }), site({ kw: null })).kw).toBe(50);
  });
});
