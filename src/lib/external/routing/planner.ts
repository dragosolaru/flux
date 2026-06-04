import type { ChargingStation } from "@/lib/external/charging-networks/types";
import type { ModelSpec } from "@/lib/brands/models";
import type { ChargingStop, RoutePoint, TripPlan, TripStrategy, TripVariant } from "./types";
import { haversine } from "./providers/mock-router";
import { computeOsrmRoute, computeOsrmRouteVia, computeOsrmAlternatives } from "./providers/osrm-router";
import { fetchCorridorStations } from "./corridor-stations";

const SAFETY_RESERVE_PCT = 10;   // Minimum SoC to arrive at any waypoint
const DEFAULT_CHARGE_TARGET = 80; // Default SoC to charge up to mid-trip

type Polyline = { type: "LineString"; coordinates: [number, number][] } | null;

/**
 * Find the lat/lng at `targetKm` along the actual road polyline by walking
 * segment-by-segment and accumulating haversine distance. Falls back to
 * straight-line interpolation when the polyline is null (OSRM fell back).
 */
function pointAlongRoute(
  polyline: Polyline,
  targetKm: number,
  origin: RoutePoint,
  destination: RoutePoint,
  totalDistanceKm: number,
): RoutePoint {
  const coords = polyline?.coordinates;
  if (!coords || coords.length < 2) {
    const t = totalDistanceKm > 0 ? Math.min(1, Math.max(0, targetKm / totalDistanceKm)) : 0;
    return {
      lat: origin.lat + (destination.lat - origin.lat) * t,
      lng: origin.lng + (destination.lng - origin.lng) * t,
    };
  }

  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const [prevLng, prevLat] = coords[i - 1]!;
    const [lng, lat] = coords[i]!;
    const a = { lat: prevLat, lng: prevLng };
    const b = { lat, lng };
    const segKm = haversine(a, b);
    if (segKm <= 0) continue;
    if (acc + segKm >= targetKm) {
      const f = (targetKm - acc) / segKm;
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
      };
    }
    acc += segKm;
  }

  const [lastLng, lastLat] = coords[coords.length - 1]!;
  return { lat: lastLat, lng: lastLng };
}

function mergeStations(a: ChargingStation[], b: ChargingStation[]): ChargingStation[] {
  const byId = new Map<string, ChargingStation>();
  for (const s of a) byId.set(s.id, s);
  for (const s of b) byId.set(s.id, s);
  return [...byId.values()];
}

interface PlanInput {
  origin: RoutePoint;
  destination: RoutePoint;
  spec: ModelSpec;
  currentSocPct: number;
  deratingPct?: number; // negative = reduction (e.g. -10 for −10%)
  stations: ChargingStation[];
  chargeTargetPct?: number;          // SoC to charge up to mid-trip (strategy lever)
  baseRoute?: {                      // precomputed road — skips the initial OSRM call
    distanceKm: number;
    drivingMinutes: number;
    polyline: { type: "LineString"; coordinates: [number, number][] } | null;
  };
  skipCorridorFetch?: boolean;       // variants flow pre-merges corridor stations once
}

/**
 * Compute a trip plan with charging stops inserted when needed.
 * Algorithm: walk along the actual road polyline in segments equal to derated
 * range × safety factor. At each "running out" point, find the nearest station
 * within reasonable detour from the next waypoint and stop there.
 */
export async function planTrip(input: PlanInput): Promise<TripPlan> {
  const { origin, destination, spec, currentSocPct, deratingPct = 0, stations } = input;
  const chargeTarget = input.chargeTargetPct ?? DEFAULT_CHARGE_TARGET;

  const osrm = input.baseRoute ?? await computeOsrmRoute(origin, destination);
  const { distanceKm, drivingMinutes } = osrm;
  const polyline = osrm.polyline;

  const allStations = input.skipCorridorFetch
    ? stations
    : mergeStations(
        stations,
        await fetchCorridorStations(polyline?.coordinates ?? null, origin, destination),
      );

  const idealRangeKm = (spec.batteryCapacityKwh / spec.efficiencyKwhPer100km) * 100;
  const deratedFullRangeKm = idealRangeKm * (1 + deratingPct / 100);
  const currentRangeKm = (currentSocPct / 100) * deratedFullRangeKm - (deratedFullRangeKm * SAFETY_RESERVE_PCT / 100);

  const stops: ChargingStop[] = [];
  let kmLeft = distanceKm;
  let kmFromStart = 0;
  let socNow = currentSocPct;
  let rangeNow = Math.max(0, currentRangeKm);
  let totalEnergyKwh = ((100 - currentSocPct) / 100) * spec.batteryCapacityKwh; // not used; placeholder
  totalEnergyKwh = 0; // reset; we'll compute charging energy

  let totalChargingMinutes = 0;
  let totalChargingCostEur = 0;
  let feasible = true;
  let warning: string | null = null;
  let iter = 0;

  while (kmLeft > 0 && iter++ < 8) {
    if (kmLeft <= rangeNow) {
      // Can reach destination directly
      kmFromStart += kmLeft;
      kmLeft = 0;
      break;
    }

    // Need to charge. Find a station near the point where we'd run out.
    // Sample the search center on the actual road polyline (not a straight line).
    const targetKm = kmFromStart + rangeNow * 0.85;
    const searchCenter = pointAlongRoute(polyline, targetKm, origin, destination, distanceKm);

    // Find compatible station within 100km detour, prefer high power
    const candidates = allStations
      .map((st) => ({ st, dist: haversine(searchCenter, st) }))
      .filter((c) => c.dist < 100)
      .sort((a, b) => (b.st.maxKw - a.st.maxKw) || (a.dist - b.dist));

    if (candidates.length === 0) {
      feasible = false;
      warning = `No charging station found near km ${Math.round(targetKm)} of the route.`;
      break;
    }

    const chosen = candidates[0]!.st;
    const detourKm = candidates[0]!.dist;

    // Drive to station: consume range corresponding to (targetKm - kmFromStart) + detour×0.5 (one-way)
    const segmentKm = (targetKm - kmFromStart) + detourKm * 0.3; // light detour cost
    socNow -= (segmentKm / deratedFullRangeKm) * 100;
    kmFromStart = targetKm;
    kmLeft = distanceKm - kmFromStart;

    const arriveSoc = Math.max(SAFETY_RESERVE_PCT, Math.round(socNow));

    // Charge to either the strategy target or enough for the remaining leg
    // (with reserve) — whichever is less.
    const remainingNeededPct = ((kmLeft + detourKm * 0.3) / deratedFullRangeKm) * 100 + SAFETY_RESERVE_PCT;
    const departSoc = Math.min(chargeTarget, Math.max(arriveSoc + 5, Math.min(95, Math.ceil(remainingNeededPct))));
    const energyAddedKwh = ((departSoc - arriveSoc) / 100) * spec.batteryCapacityKwh;
    const effectiveRateKw = Math.min(chosen.maxKw, spec.maxDcChargingRateKw) * 0.75; // avg session rate (curve)
    const chargingMinutes = Math.round((energyAddedKwh / effectiveRateKw) * 60);
    const costEur = chosen.priceEurKwh != null ? Math.round(energyAddedKwh * chosen.priceEurKwh * 100) / 100 : 0;

    stops.push({
      station: chosen,
      arriveSoc,
      departSoc,
      energyAddedKwh: Math.round(energyAddedKwh * 10) / 10,
      chargingMinutes,
      costEur,
      distanceFromStartKm: Math.round(kmFromStart),
    });

    socNow = departSoc;
    rangeNow = ((socNow - SAFETY_RESERVE_PCT) / 100) * deratedFullRangeKm;
    totalChargingMinutes += chargingMinutes;
    totalChargingCostEur += costEur;
    totalEnergyKwh += energyAddedKwh;
  }

  if (iter >= 8) {
    feasible = false;
    warning = "Route planner exceeded maximum iterations; result may be incomplete.";
  }

  // Second pass: re-route THROUGH the chosen charging stops so the polyline
  // actually passes through each station and distance/time reflect the detours.
  let finalDistanceKm = distanceKm;
  let finalDrivingMinutes = drivingMinutes;
  let finalPolyline = polyline;
  if (feasible && stops.length > 0) {
    const via = await computeOsrmRouteVia([
      origin,
      ...stops.map((s) => ({ lat: s.station.lat, lng: s.station.lng })),
      destination,
    ]);
    if (via.distanceKm > 0) {
      finalDistanceKm = via.distanceKm;
      finalDrivingMinutes = via.drivingMinutes;
      finalPolyline = via.polyline;
    }
  }

  return {
    origin,
    destination,
    totalDistanceKm: finalDistanceKm,
    drivingMinutes: finalDrivingMinutes,
    chargingMinutes: totalChargingMinutes,
    totalMinutes: finalDrivingMinutes + totalChargingMinutes,
    totalEnergyKwh: Math.round(totalEnergyKwh * 10) / 10,
    totalChargingCostEur: Math.round(totalChargingCostEur * 100) / 100,
    stops,
    feasible,
    warning,
    polyline: finalPolyline,
    approxRoute: finalPolyline === null,
  };
}

interface VariantsInput {
  origin: RoutePoint;
  destination: RoutePoint;
  spec: ModelSpec;
  currentSocPct: number;
  deratingPct?: number;
  stations: ChargingStation[];
}

const STRATEGIES: { id: TripStrategy; target: number }[] = [
  { id: "fastest", target: 70 },  // top up just enough — shorter, more frequent stops
  { id: "balanced", target: 95 }, // charge higher — fewer stops
];

/**
 * Plan a trip across alternative roads × charging strategies and return the
 * distinct, feasible options sorted fastest-first. Corridor stations are
 * fetched once and shared across every variant.
 */
export async function planTripVariants(input: VariantsInput): Promise<TripVariant[]> {
  const { origin, destination, spec, currentSocPct, deratingPct = 0, stations } = input;

  const roads = (await computeOsrmAlternatives(origin, destination, 3)).slice(0, 2);
  const primary = roads[0] ?? null;

  const corridor = await fetchCorridorStations(
    primary?.polyline?.coordinates ?? null,
    origin,
    destination,
  );
  const allStations = mergeStations(stations, corridor);

  const built: TripVariant[] = [];
  for (let r = 0; r < roads.length; r++) {
    for (const s of STRATEGIES) {
      const plan = await planTrip({
        origin,
        destination,
        spec,
        currentSocPct,
        deratingPct,
        stations: allStations,
        baseRoute: roads[r],
        chargeTargetPct: s.target,
        skipCorridorFetch: true,
      });
      if (plan.feasible) built.push({ id: `${r}-${s.id}`, strategy: s.id, roadIndex: r, plan });
    }
  }

  // Keep distinct options only (same stop count + similar total time collapse).
  const seen = new Set<string>();
  const distinct = built
    .sort((a, b) => a.plan.totalMinutes - b.plan.totalMinutes)
    .filter((v) => {
      const sig = `${v.plan.stops.length}-${Math.round(v.plan.totalMinutes / 10)}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    })
    .slice(0, 4);

  if (distinct.length > 0) return distinct;

  // Nothing feasible — return one infeasible plan so the UI can explain why.
  const plan = await planTrip({
    origin,
    destination,
    spec,
    currentSocPct,
    deratingPct,
    stations: allStations,
    baseRoute: primary ?? undefined,
    skipCorridorFetch: true,
  });
  return [{ id: "0-balanced", strategy: "balanced", roadIndex: 0, plan }];
}
