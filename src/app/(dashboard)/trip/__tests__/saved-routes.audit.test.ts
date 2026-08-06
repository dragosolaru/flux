import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirrors trip-client.tsx:63-68 verbatim (module-private there).
function parseSnapshot(raw: unknown): (Record<string, unknown> & { savedVariant?: number }) | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { plan?: { stops?: unknown }; variants?: unknown };
  if (!Array.isArray(s.variants) || !Array.isArray(s.plan?.stops)) return null;
  return raw as Record<string, unknown> & { savedVariant?: number };
}

// Mirrors trip-client.tsx:253-268 (variants / activePlan / routeLines).
interface LooseVariant { plan?: { polyline?: { coordinates?: unknown[] } | null } }
function deriveRouteLines(plan: { variants?: LooseVariant[] } | null, activeVariant: number) {
  const variants = plan?.variants ?? [];
  return variants
    .map((v, i) => ({
      index: i,
      coordinates: (v as { plan: { polyline?: { coordinates?: unknown[] } | null } }).plan.polyline?.coordinates ?? [],
      active: i === activeVariant,
    }))
    .filter((r) => r.coordinates.length >= 2);
}

// ---------------------------------------------------------------------------

describe("parseSnapshot — element-shape validation", () => {
  it("accepts a snapshot whose variant entries have no .plan", () => {
    const blob = { plan: { stops: [] }, variants: [{ id: "a", strategy: "fastest" }] };
    expect(parseSnapshot(blob)).not.toBeNull();
  });

  it("BLOCKER: that accepted snapshot throws in the routeLines derivation", () => {
    const snap = parseSnapshot({ plan: { stops: [] }, variants: [{ id: "a" }] }) as never;
    expect(() => deriveRouteLines(snap, 0)).toThrowError(TypeError);
  });

  it("empty variants + savedVariant out of range falls back safely to plan.plan", () => {
    const snap = parseSnapshot({ plan: { stops: [], polyline: null }, variants: [], savedVariant: 7 })!;
    const variants = (snap.variants as unknown[]) ?? [];
    const idx =
      typeof snap.savedVariant === "number" && snap.savedVariant >= 0 && snap.savedVariant < variants.length
        ? snap.savedVariant
        : 0;
    expect(idx).toBe(0);
    const activePlan = (variants[idx] as { plan?: unknown } | undefined)?.plan ?? snap.plan ?? null;
    expect(activePlan).not.toBeNull();
    expect(() => deriveRouteLines(snap as never, idx)).not.toThrow();
  });

  it("a variant missing plan.polyline is filtered out, not fatal", () => {
    const snap = parseSnapshot({ plan: { stops: [] }, variants: [{ plan: {} }] })!;
    expect(deriveRouteLines(snap as never, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 100_000; // saved-routes/route.ts:9

function coord(i: number): [number, number] {
  // OSRM `overview=full` geojson precision — 6 decimals, [lng, lat].
  return [Number((23.5 + i * 1e-5).toFixed(6)), Number((45.5 + i * 1e-5).toFixed(6))];
}

function fakePlan(points: number, stops: number) {
  return {
    origin: { lat: 40.9397, lng: 24.4129, label: "Kavala, Greece" },
    destination: { lat: 46.7712, lng: 23.5899, label: "Cluj-Napoca, Romania" },
    totalDistanceKm: 1400, drivingMinutes: 900, chargingMinutes: 120, totalMinutes: 1020,
    totalEnergyKwh: 240, totalChargingCostEur: 90, tripEnergyKwh: 240, tripEnergyCostEur: 90,
    feasible: true, warning: null, approxRoute: false, trafficDelayMinutes: 0,
    polyline: { type: "LineString", coordinates: Array.from({ length: points }, (_, i) => coord(i)) },
    stops: Array.from({ length: stops }, (_, i) => ({
      station: {
        id: `ocm-${100000 + i}`, networkId: "ionity", name: `Ionity Station ${i}`,
        lat: 44.1 + i, lng: 24.2 + i, maxKw: 350, totalStalls: 6,
        plugTypes: ["CCS", "Type2"], priceEurKwh: 0.69,
        addressCity: "Somewhere", addressCountry: "RO",
        lastVerifiedAt: "2026-05-01T00:00:00.000Z", isOperational: true,
        availability: "operational", confidence: 0.92,
      },
      arriveSoc: 12, departSoc: 80, energyAddedKwh: 51.2,
      chargingMinutes: 24, costEur: 35.3, distanceFromStartKm: 250 * (i + 1),
    })),
  };
}

function savePayload(pointsPerPolyline: number, stops: number) {
  const plan = fakePlan(pointsPerPolyline, stops);
  const variants = [0, 1, 2].map((i) => ({
    id: `v${i}`, strategy: "fastest", roadIndex: i, plan: fakePlan(pointsPerPolyline, stops),
  }));
  const trip = { plan, variants, vehicle: { id: "u", displayName: "M3", brand: "tesla", model: "Model 3" }, deratingPct: -12 };
  return JSON.stringify({
    name: "Kavala → Cluj-Napoca",
    origin_label: "Kavala, Greece", origin_lat: 40.9397, origin_lng: 24.4129,
    destination_label: "Cluj-Napoca, Romania", destination_lat: 46.7712, destination_lng: 23.5899,
    stops: plan.stops,
    plan_snapshot: { ...trip, savedVariant: 0 },
  });
}

describe("100KB server cap vs a real save payload", () => {
  it("reports the byte cost per polyline coordinate", () => {
    const a = savePayload(1000, 5).length;
    const b = savePayload(2000, 5).length;
    // 4 polylines in the payload (plan + 3 variants).
    const perCoord = (b - a) / (1000 * 4);
    console.log(`bytes per coordinate: ${perCoord.toFixed(1)}`);
    expect(perCoord).toBeGreaterThan(15);
  });

  it("finds the max coordinates-per-polyline that fits under the cap", () => {
    let n = 0;
    while (savePayload(n + 100, 5).length < MAX_BODY_BYTES) n += 100;
    const kmAt1400 = n / 1400;
    console.log(`max points/polyline under 100KB: ~${n} (${kmAt1400.toFixed(2)} pts/km on a 1400km route)`);
    expect(n).toBeLessThan(1500);
  });

  it("BLOCKER: Kavala→Cluj at realistic OSRM densities exceeds the cap", () => {
    for (const ptsPerKm of [2, 5, 10, 25]) {
      const size = savePayload(1400 * ptsPerKm, 5).length;
      console.log(`${ptsPerKm} pts/km → ${(size / 1024).toFixed(0)} KB → ${size > MAX_BODY_BYTES ? "413 REJECTED" : "ok"}`);
      expect(size).toBeGreaterThan(MAX_BODY_BYTES);
    }
  });

  it("even a short 120km trip at full OSRM geometry exceeds the cap", () => {
    const size = savePayload(120 * 25, 1).length;
    console.log(`120km @25 pts/km → ${(size / 1024).toFixed(0)} KB`);
    expect(size).toBeGreaterThan(MAX_BODY_BYTES);
  });
});

// ---------------------------------------------------------------------------

describe("SavedRouteSchema — z.unknown() vs NOT NULL columns", () => {
  const SavedRouteSchema = z.object({
    name: z.string().min(1).max(100),
    origin_label: z.string().min(1).max(300),
    origin_lat: z.number().min(-90).max(90),
    origin_lng: z.number().min(-180).max(180),
    destination_label: z.string().min(1).max(300),
    destination_lat: z.number().min(-90).max(90),
    destination_lng: z.number().min(-180).max(180),
    stops: z.unknown(),
    plan_snapshot: z.unknown(),
  });
  const base = {
    name: "x", origin_label: "a", origin_lat: 1, origin_lng: 2,
    destination_label: "b", destination_lat: 3, destination_lng: 4,
  };

  it("accepts explicit null for stops / plan_snapshot (→ NOT NULL violation → 500)", () => {
    const r = SavedRouteSchema.safeParse({ ...base, stops: null, plan_snapshot: null });
    expect(r.success).toBe(true);
    expect(r.success && r.data.plan_snapshot).toBeNull();
  });

  it("zod 4: z.unknown() is REQUIRED, so omitting the keys 422s instead of using the column default", () => {
    const r = SavedRouteSchema.safeParse(base);
    expect(r.success).toBe(false);
  });
});
