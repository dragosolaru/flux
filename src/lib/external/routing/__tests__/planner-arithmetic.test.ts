import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChargingStation } from "@/lib/external/charging-networks/types";
import type { RoutePoint } from "../types";
import { haversine } from "../providers/mock-router";
import { BRAND_MODELS } from "@/lib/brands/models";

// All network providers are stubbed — this suite is about the planner's own
// arithmetic, not about any external routing service.
vi.mock("../providers/tomtom-router", () => ({
  computeTomTomAlternatives: async () => [],
  computeTomTomRouteVia: async () => null,
}));
vi.mock("../providers/ors-router", () => ({
  computeOrsAlternatives: async () => [],
}));
vi.mock("../providers/osrm-router", () => ({
  computeOsrmRoute: async () => ({ distanceKm: 0, drivingMinutes: 0, polyline: null }),
  computeOsrmAlternatives: async () => [],
  computeOsrmRouteVia: async (points: RoutePoint[]) => {
    let km = 0;
    for (let i = 1; i < points.length; i++) km += haversine(points[i - 1]!, points[i]!);
    return { distanceKm: km, drivingMinutes: Math.round((km / 95) * 60), polyline: null };
  },
}));
vi.mock("../corridor-stations", () => ({ fetchCorridorStations: async () => [] }));

const { planTrip } = await import("../planner");

const KM_PER_DEG_LAT = 111.195;
const SPEC = BRAND_MODELS.tesla[0]!; // Model 3: 75 kWh, 16 kWh/100km, 250 kW DC
const IDEAL_RANGE_KM = (SPEC.batteryCapacityKwh / SPEC.efficiencyKwhPer100km) * 100; // 468.75

/**
 * A synthetic north-bound meridian route of an exact length in km, so the
 * declared distance and the polyline's own walked length agree. (Real Kavala →
 * Cluj road distance is ~1000-1100 km; 1400 km here is the brief's figure used
 * as a long-trip stress scale, with synthetic geometry so the arithmetic is
 * checkable.)
 */
function meridianRoute(lengthKm: number, lng = 24.4) {
  const startLat = 40.9397;
  const endLat = startLat + lengthKm / KM_PER_DEG_LAT;
  const coords: [number, number][] = [];
  const N = 200;
  for (let i = 0; i <= N; i++) {
    coords.push([lng, startLat + ((endLat - startLat) * i) / N]);
  }
  const origin: RoutePoint = { lat: startLat, lng };
  const destination: RoutePoint = { lat: endLat, lng };
  let actualKm = 0;
  for (let i = 1; i < coords.length; i++) {
    actualKm += haversine(
      { lat: coords[i - 1]![1], lng: coords[i - 1]![0] },
      { lat: coords[i]![1], lng: coords[i]![0] },
    );
  }
  return {
    origin,
    destination,
    baseRoute: {
      distanceKm: actualKm,
      drivingMinutes: Math.round((actualKm / 95) * 60),
      polyline: { type: "LineString" as const, coordinates: coords },
    },
  };
}

/** Stations sitting exactly on the route every `everyKm`, so detour ≈ 0. */
function stationsAlong(lengthKm: number, everyKm: number, maxKw = 250, lng = 24.4): ChargingStation[] {
  const startLat = 40.9397;
  const out: ChargingStation[] = [];
  for (let km = everyKm; km < lengthKm; km += everyKm) {
    out.push({
      id: `st-${km}`,
      networkId: "tesla-sc",
      name: `Supercharger ${km}`,
      lat: startLat + km / KM_PER_DEG_LAT,
      lng,
      maxKw,
      totalStalls: 8,
      plugTypes: ["CCS"],
      priceEurKwh: 0.45,
      addressCity: "X",
      addressCountry: "RO",
    } as ChargingStation);
  }
  return out;
}

beforeEach(() => vi.clearAllMocks());

describe("planner arithmetic — self-consistency at three scales", () => {
  const scales = [
    { name: "short 60 km", km: 60 },
    { name: "medium 400 km", km: 400 },
    { name: "long 1400 km", km: 1400 },
  ];

  for (const { name, km } of scales) {
    it(`${name}: energy, SoC and charging time are consistent`, async () => {
      const r = meridianRoute(km);
      const plan = await planTrip({
        ...r,
        spec: SPEC,
        currentSocPct: 90,
        stations: stationsAlong(km, 50),
        skipCorridorFetch: true,
      });

      expect(plan.feasible).toBe(true);

      // (1) trip energy vs distance × efficiency (no derating here)
      const expectedKwh = (plan.totalDistanceKm / 100) * SPEC.efficiencyKwhPer100km;
      expect(plan.tripEnergyKwh).toBeCloseTo(Math.round(expectedKwh * 10) / 10, 1);

      // (2) stop bookkeeping
      let prevKm = 0;
      let sumEnergy = 0;
      let sumMinutes = 0;
      for (const s of plan.stops) {
        expect(s.arriveSoc).toBeGreaterThanOrEqual(0);
        expect(s.arriveSoc).toBeLessThanOrEqual(100);
        expect(s.departSoc).toBeLessThanOrEqual(100);
        expect(s.departSoc).toBeGreaterThanOrEqual(s.arriveSoc);
        expect(s.energyAddedKwh).toBeGreaterThanOrEqual(0);
        expect(s.energyAddedKwh).toBeLessThanOrEqual(SPEC.batteryCapacityKwh);
        expect(s.distanceFromStartKm).toBeGreaterThan(prevKm);
        expect(s.distanceFromStartKm).toBeLessThanOrEqual(Math.ceil(plan.totalDistanceKm));
        prevKm = s.distanceFromStartKm;

        // charging time vs energy at the stated power: average power drawn can
        // never exceed min(station kW, vehicle peak kW)
        if (s.chargingMinutes > 0) {
          const avgKw = s.energyAddedKwh / (s.chargingMinutes / 60);
          expect(avgKw).toBeLessThanOrEqual(Math.min(s.station.maxKw, SPEC.maxDcChargingRateKw) + 1);
          expect(avgKw).toBeGreaterThan(10); // a DC stop below 10 kW average is nonsense
        }
        sumEnergy += s.energyAddedKwh;
        sumMinutes += s.chargingMinutes;
      }
      expect(plan.totalEnergyKwh).toBeCloseTo(sumEnergy, 0);
      expect(plan.chargingMinutes).toBe(sumMinutes);
      expect(plan.totalMinutes).toBe(plan.drivingMinutes + plan.chargingMinutes);

      // (3) plausibility for a real EV
      const impliedPer100 = (plan.tripEnergyKwh / plan.totalDistanceKm) * 100;
      expect(impliedPer100).toBeGreaterThan(12);
      expect(impliedPer100).toBeLessThan(30);
    });
  }

  it("short trip needs no charging stop and still reports non-zero energy cost", async () => {
    const r = meridianRoute(60);
    const plan = await planTrip({
      ...r,
      spec: SPEC,
      currentSocPct: 90,
      stations: stationsAlong(60, 20),
      skipCorridorFetch: true,
    });
    expect(plan.stops).toHaveLength(0);
    expect(plan.tripEnergyCostEur).toBeGreaterThan(0);
  });

  it("1400 km at 469 km ideal range needs a plausible number of stops", async () => {
    const r = meridianRoute(1400);
    const plan = await planTrip({
      ...r,
      spec: SPEC,
      currentSocPct: 90,
      stations: stationsAlong(1400, 50),
      skipCorridorFetch: true,
    });
    // 1400 km / ~370 km usable per full charge ≥ 3 stops; more than 6 would be
    // implausible for a 250 kW car on a well-covered corridor.
    expect(plan.stops.length).toBeGreaterThanOrEqual(3);
    expect(plan.stops.length).toBeLessThanOrEqual(6);
    // total charging time for 1400 km should be roughly 1–3 h
    expect(plan.chargingMinutes).toBeGreaterThan(45);
    expect(plan.chargingMinutes).toBeLessThan(200);
  });

  it("derating raises energy for the same distance by the stated factor", async () => {
    const r = meridianRoute(400);
    const base = await planTrip({
      ...r, spec: SPEC, currentSocPct: 90, stations: [], skipCorridorFetch: true,
    });
    const cold = await planTrip({
      ...r, spec: SPEC, currentSocPct: 90, stations: [], deratingPct: -20, skipCorridorFetch: true,
    });
    expect(cold.tripEnergyKwh / base.tripEnergyKwh).toBeCloseTo(1 / 0.8, 2);
  });
});

describe("planner arithmetic — failure modes", () => {
  it("a stop never departs below the SoC it arrived with", async () => {
    const r = meridianRoute(700);
    const plan = await planTrip({
      ...r,
      spec: SPEC,
      currentSocPct: 100,
      arrivalSocPct: 50,      // API allows up to 50
      chargeTargetPct: 55,    // "economy" strategy target
      stations: stationsAlong(700, 50),
      skipCorridorFetch: true,
    });
    // A strategy's charge ceiling (economy is 55) sitting below a high arrival
    // floor used to clamp departure under arrival, producing a stop with
    // negative energy and negative cost. Leaving with less than you arrived
    // with is not a charging stop.
    expect(plan.stops.filter((s) => s.departSoc < s.arriveSoc)).toHaveLength(0);
    for (const stop of plan.stops) {
      expect(stop.energyAddedKwh).toBeGreaterThanOrEqual(0);
      expect(stop.costEur).toBeGreaterThanOrEqual(0);
    }
  });

  it("BUG: a station sitting ON the route is billed a round-trip detour, overstating distance and understating arrival SoC", async () => {
    const r = meridianRoute(400);
    // One station, exactly on the polyline at 300 km from the start.
    const st = stationsAlong(400, 300)[0]!;
    const plan = await planTrip({
      ...r,
      spec: SPEC,
      currentSocPct: 90,
      stations: [st],
      skipCorridorFetch: true,
    });
    const stop = plan.stops[0]!;
    // Truth: 300 km at 16 kWh/100 km from 90% of a 75 kWh pack → ~26% on arrival.
    const trueArriveSoc = 90 - (300 / IDEAL_RANGE_KM) * 100;
    expect(trueArriveSoc).toBeGreaterThan(25); // ~26%
    // Reported: the run-out point (319 km) plus 2× the 19 km "detour" = 356 km.
    expect(stop.distanceFromStartKm).toBeGreaterThan(310); // station is at 300 km
    expect(stop.arriveSoc).toBeLessThan(trueArriveSoc - 10); // ~14% vs ~26%
  });

  it("BUG: a station reachable only via a 100 km detour is still reported as arriving at the SoC floor", async () => {
    const r = meridianRoute(500);
    const far = stationsAlong(500, 250).map((s) => ({
      ...s,
      lng: s.lng + 100 / (111.195 * Math.cos((s.lat * Math.PI) / 180)), // ~100 km off-route
    }));
    const plan = await planTrip({
      ...r,
      spec: SPEC,
      currentSocPct: 60,
      stations: far,
      skipCorridorFetch: true,
    });
    expect(plan.stops.length).toBeGreaterThan(0);
    // The car cannot physically make a 200 km round-trip detour on this leg, yet
    // the plan reports a healthy arrival SoC and stays "feasible".
    expect(plan.stops[0]!.arriveSoc).toBeGreaterThanOrEqual(10);
    expect(plan.feasible).toBe(true);
  });

  it("hitting the stop limit reports the plan as not feasible", async () => {
    // Tiny battery + huge distance forces > 30 iterations.
    const smallSpec = { ...SPEC, batteryCapacityKwh: 20, efficiencyKwhPer100km: 20 };
    const r = meridianRoute(2000);
    const plan = await planTrip({
      ...r,
      spec: smallSpec,
      currentSocPct: 100,
      stations: stationsAlong(2000, 20),
      skipCorridorFetch: true,
    });
    const last = plan.stops[plan.stops.length - 1]!;
    const smallIdealRangeKm = (smallSpec.batteryCapacityKwh / smallSpec.efficiencyKwhPer100km) * 100;
    expect(plan.warning).toContain("stop limit");
    expect(plan.feasible).toBe(false);
    // Distance left after the last planned stop exceeds the car's FULL range,
    // yet the plan is handed to the UI as feasible.
    expect(plan.totalDistanceKm - last.distanceFromStartKm).toBeGreaterThan(smallIdealRangeKm);
  });
});

describe("ideal range vs advertised range", () => {
  it("spec maxRangeKm and battery/efficiency disagree by >20%", () => {
    expect(IDEAL_RANGE_KM).toBeCloseTo(468.75, 2);
    expect(SPEC.maxRangeKm).toBe(602);
    expect(SPEC.maxRangeKm / IDEAL_RANGE_KM).toBeGreaterThan(1.2);
  });
});
