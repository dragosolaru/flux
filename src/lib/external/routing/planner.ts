import type { ChargingStation } from "@/lib/external/charging-networks/types";
import type { ModelSpec } from "@/lib/brands/models";
import type { ChargingStop, RoutePoint, TripPlan, TripStrategy, TripVariant } from "./types";
import { haversine } from "./providers/mock-router";
import { computeOsrmRoute, computeOsrmRouteVia, computeOsrmAlternatives } from "./providers/osrm-router";
import { computeOrsAlternatives } from "./providers/ors-router";
import type { OsrmResult } from "./providers/osrm-router";
import { fetchCorridorStations } from "./corridor-stations";

const DEFAULT_ARRIVAL_SOC_PCT = 10; // Default minimum SoC at destination/waypoint
const DEFAULT_CHARGE_TARGET = 80; // Default SoC to charge up to mid-trip
// Fallback home electricity price (EUR/kWh) when no tariff is configured.
// ~1 RON/kWh ≈ €0.20. Used to price the energy a trip consumes so the cost is
// never shown as €0 just because no public charging stop was needed.
const DEFAULT_HOME_PRICE_EUR_KWH = 0.20;

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

/**
 * Distinct road alternatives between two points. Prefers OpenRouteService when
 * an API key is configured (it returns genuinely different roads, like ABRP /
 * Waze do); otherwise falls back to OSRM's public server, which usually returns
 * a single road for long corridors.
 */
async function computeRouteAlternatives(
  origin: RoutePoint,
  destination: RoutePoint,
  max: number,
): Promise<OsrmResult[]> {
  const ors = await computeOrsAlternatives(origin, destination, max);
  if (ors.length > 0) return ors;
  return computeOsrmAlternatives(origin, destination, max);
}

interface PlanInput {
  origin: RoutePoint;
  destination: RoutePoint;
  spec: ModelSpec;
  currentSocPct: number;
  deratingPct?: number; // negative = reduction (e.g. -10 for −10%)
  stations: ChargingStation[];
  chargeTargetPct?: number;          // SoC to charge up to mid-trip (strategy lever)
  arrivalSocPct?: number;            // minimum SoC to arrive at destination (default 10)
  homePriceEurKwh?: number;          // price to recharge consumed energy at home
  efficiencyKwhPer100km?: number;    // personal consumption (overrides spec)
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
  const arrivalSocPct = input.arrivalSocPct ?? DEFAULT_ARRIVAL_SOC_PCT;

  const osrm = input.baseRoute ?? await computeOsrmRoute(origin, destination);
  const { distanceKm, drivingMinutes } = osrm;
  const polyline = osrm.polyline;

  const allStations = input.skipCorridorFetch
    ? stations
    : mergeStations(
        stations,
        await fetchCorridorStations(polyline?.coordinates ?? null, origin, destination),
      );

  // Prefer the driver's measured consumption (from real charging + trip
  // history) over the model's spec figure — a cold-climate / heavy-foot driver
  // gets a shorter, accurate range estimate instead of the optimistic spec.
  const efficiencyKwhPer100km = input.efficiencyKwhPer100km ?? spec.efficiencyKwhPer100km;
  const idealRangeKm = (spec.batteryCapacityKwh / efficiencyKwhPer100km) * 100;
  const deratedFullRangeKm = idealRangeKm * (1 + deratingPct / 100);
  // Available range from current SoC down to arrivalSocPct buffer (not 0%).
  const currentRangeKm = (currentSocPct - arrivalSocPct) / 100 * deratedFullRangeKm;

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
      // Can reach destination with at least arrivalSocPct remaining
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

    const arriveSoc = Math.max(arrivalSocPct, Math.round(socNow));

    // Charge to either the strategy target or enough for the remaining leg
    // including the arrivalSocPct buffer at the next stop/destination.
    const remainingNeededPct = ((kmLeft + detourKm * 0.3) / deratedFullRangeKm) * 100 + arrivalSocPct;
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
    rangeNow = ((socNow - arrivalSocPct) / 100) * deratedFullRangeKm;
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

  // Energy consumed to cover the whole route, accounting for weather/temp via
  // the derated range. Independent of whether we charged mid-trip — this is the
  // real cost of the distance, priced at the home electricity rate.
  const homePrice = input.homePriceEurKwh ?? DEFAULT_HOME_PRICE_EUR_KWH;
  const tripEnergyKwh =
    deratedFullRangeKm > 0
      ? (finalDistanceKm / deratedFullRangeKm) * spec.batteryCapacityKwh
      : 0;
  const tripEnergyCostEur = tripEnergyKwh * homePrice;

  return {
    origin,
    destination,
    totalDistanceKm: finalDistanceKm,
    drivingMinutes: finalDrivingMinutes,
    chargingMinutes: totalChargingMinutes,
    totalMinutes: finalDrivingMinutes + totalChargingMinutes,
    totalEnergyKwh: Math.round(totalEnergyKwh * 10) / 10,
    totalChargingCostEur: Math.round(totalChargingCostEur * 100) / 100,
    tripEnergyKwh: Math.round(tripEnergyKwh * 10) / 10,
    tripEnergyCostEur: Math.round(tripEnergyCostEur * 100) / 100,
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
  arrivalSocPct?: number;            // minimum SoC to arrive at destination (default 10)
  homePriceEurKwh?: number;
  efficiencyKwhPer100km?: number;
}

const STRATEGIES: { id: TripStrategy; target: number }[] = [
  { id: "fastest", target: 70 },  // top up just enough — shorter, more frequent stops
  { id: "balanced", target: 95 }, // charge higher — fewer stops
];

/**
 * Plan a trip across alternative roads × charging strategies and return the
 * distinct, feasible options sorted fastest-first. Corridor stations are
 * fetched once and shared across every variant. Both OSRM alternatives and
 * corridor station fetch run in parallel, and all road×strategy combinations
 * are planned concurrently via Promise.all.
 */
export async function planTripVariants(input: VariantsInput): Promise<TripVariant[]> {
  const { origin, destination, spec, currentSocPct, deratingPct = 0, stations, arrivalSocPct, homePriceEurKwh, efficiencyKwhPer100km } = input;

  const [roadsAll, corridor] = await Promise.all([
    computeRouteAlternatives(origin, destination, 3),
    fetchCorridorStations(null, origin, destination),
  ]);
  const roads = roadsAll.slice(0, 3);
  const primary = roads[0] ?? null;

  // Re-fetch corridor using the primary road polyline now that we have it,
  // then merge with the null-polyline result already fetched above (fast path).
  const corridorWithPolyline = primary?.polyline?.coordinates
    ? await fetchCorridorStations(primary.polyline.coordinates, origin, destination)
    : corridor;
  const allStations = mergeStations(stations, mergeStations(corridor, corridorWithPolyline));

  const combinations = roads.flatMap((road, r) =>
    STRATEGIES.map((s) => ({ road, r, s }))
  );

  const results = await Promise.all(
    combinations.map(({ road, r, s }) =>
      planTrip({
        origin,
        destination,
        spec,
        currentSocPct,
        deratingPct,
        stations: allStations,
        baseRoute: road,
        chargeTargetPct: s.target,
        arrivalSocPct,
        homePriceEurKwh,
        efficiencyKwhPer100km,
        skipCorridorFetch: true,
      }).then((plan) => (plan.feasible ? { id: `${r}-${s.id}`, strategy: s.id, roadIndex: r, plan } as TripVariant : null))
    )
  );

  const built = results.filter((v): v is TripVariant => v !== null);

  // Keep distinct options only. The signature is based on the *plan output*
  // (rounded distance + the exact set of charging stops + rounded total time),
  // NOT the strategy that produced it. This collapses two strategies that
  // happen to yield the identical road and the identical single stop — which
  // previously showed up as two visually identical variants ("Fastest" and
  // "Fewest stops" both 476 km · 1 stop · €12.36). Genuinely different roads
  // still differ in distance and/or station set, so real alternatives survive.
  const seen = new Set<string>();
  const distinct = built
    .sort((a, b) => a.plan.totalMinutes - b.plan.totalMinutes)
    .filter((v) => {
      const stopIds = v.plan.stops.map((s) => s.station.id).join(",");
      const sig = `${Math.round(v.plan.totalDistanceKm)}-${stopIds}-${Math.round(v.plan.totalMinutes / 5)}`;
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
    arrivalSocPct,
    homePriceEurKwh,
    efficiencyKwhPer100km,
    skipCorridorFetch: true,
  });
  return [{ id: "0-balanced", strategy: "balanced", roadIndex: 0, plan }];
}
