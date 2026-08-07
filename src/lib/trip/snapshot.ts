// Building the snapshot a saved route stores.
//
// Kept out of the page: holding this beside one of two duplicated planners is
// how they drifted apart in the first place.

import type { TripPlan, TripVariant } from "@/lib/external/routing/types";

export interface PlannedTrip {
  plan: TripPlan;
  variants: TripVariant[];
  vehicle: { id: string; displayName: string; brand: string; model: string | null } | null;
  deratingPct: number;
}

// Snapshots are persisted as JSONB behind a 100 KB request cap. A planned trip
// carries a full-geometry polyline per variant (OSRM is queried with
// overview=full), so storing it verbatim puts any real road trip far over the
// cap — a 1400 km route rejects with 413. Keep only the variant the driver
// actually chose, and thin its polyline to an overview-quality line.
const SNAPSHOT_MAX_POINTS = 400;

function downsample(coords: [number, number][]): [number, number][] {
  if (coords.length <= SNAPSHOT_MAX_POINTS) return coords;
  const step = (coords.length - 1) / (SNAPSHOT_MAX_POINTS - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < SNAPSHOT_MAX_POINTS; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}

export function compactSnapshot(response: PlannedTrip, variantIndex: number): PlannedTrip {
  const variant = response.variants[variantIndex] ?? response.variants[0] ?? null;
  const source = variant?.plan ?? response.plan;
  const slimPlan: TripPlan = {
    ...source,
    polyline: source.polyline
      ? { ...source.polyline, coordinates: downsample(source.polyline.coordinates) }
      : null,
  };
  return {
    ...response,
    plan: slimPlan,
    variants: variant ? [{ ...variant, plan: slimPlan }] : [],
  };
}

/**
 * Saved snapshots come back as untyped JSONB. A truncated or legacy-shaped blob
 * must not crash the results panel, so validate the load-bearing arrays AND
 * their elements before trusting the cast — the variant chips and the route
 * lines dereference `v.plan` unguarded, and a bad blob reloads on every visit.
 */
export function parseSnapshot(raw: unknown): PlannedTrip | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { plan?: { stops?: unknown }; variants?: unknown };
  if (!Array.isArray(s.variants) || !Array.isArray(s.plan?.stops)) return null;
  const variantsOk = s.variants.every(
    (v) =>
      v != null &&
      typeof v === "object" &&
      Array.isArray((v as { plan?: { stops?: unknown } }).plan?.stops),
  );
  if (!variantsOk) return null;
  return raw as PlannedTrip;
}
