import type { ChargingStation } from "@/lib/external/charging-networks/types";
import type { ModelSpec } from "@/lib/brands/models";
import type { ConnectorType } from "@/lib/chargers/types";
import type { PlugType } from "@/lib/external/charging-networks/types";
import type { ChargingStop, RoutePoint, TripPlan, TripStrategy, TripVariant } from "./types";
import { haversine } from "./providers/mock-router";
import { computeOsrmRoute, computeOsrmRouteVia, computeOsrmAlternatives } from "./providers/osrm-router";
import { computeOrsAlternatives } from "./providers/ors-router";
import { computeTomTomAlternatives, computeTomTomRouteVia } from "./providers/tomtom-router";
import type { OsrmResult } from "./providers/osrm-router";
import { fetchCorridorStations } from "./corridor-stations";
import { chargeMinutes } from "./charge-curve";

const DEFAULT_ARRIVAL_SOC_PCT = 10; // Default minimum SoC at destination/waypoint
const DEFAULT_CHARGE_TARGET = 80; // Default SoC to charge up to mid-trip
// How far off the route a stop may sit. Replaces a 150 km radius measured from
// the point the battery would run out — which, being anchored to a moving
// sample point rather than to the road, also admitted stations already behind
// the car.
const MAX_OFF_ROUTE_KM = 25;
// Fallback home electricity price (EUR/kWh) when no tariff is configured.
// ~1 RON/kWh ≈ €0.20. Used to price the energy a trip consumes so the cost is
// never shown as €0 just because no public charging stop was needed.
const DEFAULT_HOME_PRICE_EUR_KWH = 0.20;
// Assumed average tariff when a station has no price data — used only as a
// relative penalty in scoring, not as a cost estimate shown to the user.
const ASSUMED_AVG_PRICE_EUR_KWH = 0.45;

// Map from the domain ConnectorType to the ChargingStation.plugTypes PlugType so
// the connector compatibility check works across both type systems.
const CONNECTOR_TYPE_TO_PLUG: Record<ConnectorType, PlugType | null> = {
  ccs2: "CCS",
  ccs1: "CCS",
  chademo: "CHAdeMO",
  type2: "Type2",
  type1: "Type2",
  tesla: "Tesla",
  schuko: null,
  other: null,
};

type Polyline = { type: "LineString"; coordinates: [number, number][] } | null;

/**
 * Where a station sits relative to the route.
 *
 * `alongKm` is how far along the route its nearest point is; `offRouteKm` is how
 * far the station is from that point. Together they answer the only two
 * questions the planner has: how much further do I drive to get level with it,
 * and how far do I leave the road.
 *
 * The planner used to substitute the haversine distance from the *search
 * centre* — the point where the battery would run out — for both. A station
 * sitting exactly on the road 19 km beyond that point was therefore billed a
 * 19 km detour, doubled for the return, on top of the distance already driven.
 * `planner-arithmetic.test.ts` recorded the result: a stop at 300 km reported
 * at 356 km, arriving at 14% instead of 26%.
 *
 * Projection is planar with longitude scaled by cos(latitude). Over a polyline
 * segment — hundreds of metres to a few km — the error against a true geodesic
 * is far below the precision of anything downstream.
 */
interface RouteProjection {
  alongKm: number;
  offRouteKm: number;
}

function projectOntoRoute(
  polyline: Polyline,
  point: RoutePoint,
  origin: RoutePoint,
  destination: RoutePoint,
  totalDistanceKm: number,
): RouteProjection {
  const coords = polyline?.coordinates;
  const hasPolyline = !!coords && coords.length >= 2;
  const pts: RoutePoint[] = hasPolyline
    ? coords!.map(([lng, lat]) => ({ lat, lng }))
    : [origin, destination];

  let acc = 0;
  let bestAlong = 0;
  let bestOff = Infinity;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const segKm = haversine(a, b);
    if (segKm <= 0) continue;

    const kx = Math.cos((a.lat * Math.PI) / 180) || 1;
    const ax = a.lng * kx;
    const ay = a.lat;
    const dx = b.lng * kx - ax;
    const dy = b.lat - ay;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 > 0
        ? Math.max(0, Math.min(1, ((point.lng * kx - ax) * dx + (point.lat - ay) * dy) / len2))
        : 0;
    const nearest = { lat: ay + dy * t, lng: (ax + dx * t) / kx };
    const off = haversine(point, nearest);

    if (off < bestOff) {
      bestOff = off;
      bestAlong = acc + segKm * t;
    }
    acc += segKm;
  }

  // With no polyline, `acc` is the straight origin→destination length. Rescale
  // so alongKm shares an axis with totalDistanceKm, which follows the road.
  if (!hasPolyline && acc > 0 && totalDistanceKm > 0) {
    bestAlong *= totalDistanceKm / acc;
  }

  return { alongKm: bestAlong, offRouteKm: bestOff === Infinity ? 0 : bestOff };
}

function mergeStations(a: ChargingStation[], b: ChargingStation[]): ChargingStation[] {
  const byId = new Map<string, ChargingStation>();
  for (const s of a) byId.set(s.id, s);
  for (const s of b) byId.set(s.id, s);
  return [...byId.values()];
}

/**
 * Returns true when the station has at least one connector type compatible with
 * the vehicle's supportedConnectors list. Stations with no plug type info always
 * pass — we never exclude an unknown station.
 */
export function isConnectorCompatible(
  station: ChargingStation,
  supportedConnectors: ConnectorType[],
): boolean {
  if (station.plugTypes.length === 0) return true;
  const supportedPlugs = new Set<PlugType>();
  for (const c of supportedConnectors) {
    const plug = CONNECTOR_TYPE_TO_PLUG[c];
    if (plug) supportedPlugs.add(plug);
  }
  return station.plugTypes.some((p) => supportedPlugs.has(p));
}

/**
 * Score a candidate station (higher = better). Pure function, exported for tests.
 *
 * Weights (roughly):
 *  +power   dominant: effective kW = min(station.maxKw, vehicle.maxDcKw) / 100
 *  -detour  km from the search centre, scaled to ~same magnitude as a 50 kW gain
 *  -price   EUR/kWh above/below 0.45 average — moderate penalty
 *  +stalls  small bonus when totalStalls ≥ 4 (queue risk)
 *  -stale   small penalty for unverified data
 */
export function scoreStation(
  station: ChargingStation,
  distKm: number,
  vehicleMaxDcKw: number,
): number {
  const effectiveKw = Math.min(station.maxKw, vehicleMaxDcKw);
  const powerScore = effectiveKw / 100;

  const detourPenalty = distKm * 0.03; // 1 km detour ≈ 3 kW equivalent

  const pricePerKwh = station.priceEurKwh ?? ASSUMED_AVG_PRICE_EUR_KWH;
  const pricePenalty = (pricePerKwh - ASSUMED_AVG_PRICE_EUR_KWH) * 0.8;

  const stallBonus = station.totalStalls >= 4 ? 0.1 : 0;

  const stalePenalty = station.availability === "stale" ? 0.05 : 0;

  return powerScore - detourPenalty - pricePenalty + stallBonus - stalePenalty;
}

/**
 * Filter out stations that cannot be used for this leg:
 * - offline (known down)
 * - low confidence (< 0.5)
 * - connector-incompatible with the vehicle (unknown plug type passes)
 */
export function filterUsableStations(
  stations: ChargingStation[],
  supportedConnectors: ConnectorType[],
): ChargingStation[] {
  return stations.filter((st) => {
    if (st.availability === "offline") return false;
    if (st.confidence !== undefined && st.confidence < 0.5) return false;
    if (!isConnectorCompatible(st, supportedConnectors)) return false;
    return true;
  });
}

/**
 * Distinct road alternatives between two points. Prefers TomTom when its key is
 * set — its ETAs include live traffic (Waze/Google-like) and it returns genuine
 * alternatives. Falls back to OpenRouteService (distinct roads), then OSRM.
 */
async function computeRouteAlternatives(
  origin: RoutePoint,
  destination: RoutePoint,
  max: number,
): Promise<OsrmResult[]> {
  const tomtom = await computeTomTomAlternatives(origin, destination, max);
  if (tomtom.length > 0) return tomtom;
  const ors = await computeOrsAlternatives(origin, destination, max);
  if (ors.length > 0) return ors;
  return computeOsrmAlternatives(origin, destination, max);
}

/**
 * Route through ordered waypoints (origin, …stops, destination), traffic-aware
 * when the TomTom key is set, otherwise via OSRM.
 */
async function computeRouteVia(points: RoutePoint[]): Promise<OsrmResult> {
  const tomtom = await computeTomTomRouteVia(points);
  if (tomtom && tomtom.distanceKm > 0) return tomtom;
  return computeOsrmRouteVia(points);
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
    trafficDelayMinutes?: number;
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

  const rawStations = input.skipCorridorFetch
    ? stations
    : mergeStations(
        stations,
        await fetchCorridorStations(polyline?.coordinates ?? null, origin, destination),
      );

  // Apply reliability and connector filters once, before any candidate loops.
  const supportedConnectors = spec.supportedConnectors ?? [];
  const allStations = filterUsableStations(rawStations, supportedConnectors);

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
  let totalEnergyKwh = 0;

  let totalChargingMinutes = 0;
  let totalChargingCostEur = 0;
  let feasible = true;
  let warning: string | null = null;
  let iter = 0;

  // Driven distance including detours, and the base route's average pace. The
  // pace is the only per-stop timing signal available before the second pass
  // re-routes through the stops.
  let drivenKm = 0;
  const minutesPerKm = distanceKm > 0 ? drivingMinutes / distanceKm : 0;

  while (kmLeft > 0 && iter++ < 30) {
    if (kmLeft <= rangeNow) {
      // Can reach destination with at least arrivalSocPct remaining.
      // The final leg counts: drivenKm is the denominator when the per-stop
      // numbers are rescaled onto the via-route, and leaving it out made the
      // scale factor larger than 1 — pushing a stop at 300 km out to 400.
      drivenKm += kmLeft;
      kmFromStart += kmLeft;
      kmLeft = 0;
      break;
    }

    // Need to charge. `targetKm` is where the battery would run low — not a
    // place to search around any more (candidates are now judged against the
    // whole route), but still the distance a good stop should get close to.
    const targetKm = kmFromStart + rangeNow * 0.85;

    // Candidates are judged by where they sit relative to the ROUTE, not by how
    // far they are from the search centre. Three conditions, each of which the
    // old distance-from-centre test could not express:
    //
    //   ahead      — a station behind us is not a stop, it is a U-turn. The old
    //                filter accepted anything within 150 km of the centre,
    //                including stations already passed.
    //   near       — off-route distance under MAX_OFF_ROUTE_KM.
    //   reachable  — driving level with it and then leaving the road must fit
    //                inside the range we actually have.
    const candidates = allStations
      .map((st) => {
        const proj = projectOntoRoute(polyline, st, origin, destination, distanceKm);
        return { st, alongKm: proj.alongKm, offRouteKm: proj.offRouteKm };
      })
      .filter(
        (c) =>
          (c.st.maxKw ?? 0) > 0 &&
          c.alongKm > kmFromStart &&
          c.offRouteKm < MAX_OFF_ROUTE_KM &&
          c.alongKm - kmFromStart + c.offRouteKm <= rangeNow,
      )
      .map((c) => ({
        ...c,
        // Power and price decide between comparable stations; how far along the
        // route the station sits decides whether this is one stop or three.
        // Without the progress term the highest-powered charger 50 km ahead
        // always wins and a 1400 km route collapses into sixteen short hops —
        // the old code got this for free by only ever searching near the range
        // limit, which is also why it could not see stations behind it.
        score:
          scoreStation(c.st, c.offRouteKm, spec.maxDcChargingRateKw) -
          Math.abs(c.alongKm - targetKm) * 0.01,
      }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      feasible = false;
      const gapStart = Math.round(kmFromStart);
      const gapEnd = Math.round(kmFromStart + rangeNow);
      warning = `No charging coverage between ${gapStart} km and ${gapEnd} km along the route.`;
      break;
    }

    const best = candidates[0]!;
    const chosen = best.st;
    const { alongKm, offRouteKm } = best;

    // Getting there costs the run along the route plus ONE off-route leg. The
    // return leg is not spent yet — it is charged after leaving, so it belongs
    // to the next segment's requirement, not this arrival. Counting it twice
    // here (once out, once back, before arriving) is what understated every
    // arrival SoC.
    const toStationKm = alongKm - kmFromStart + offRouteKm;
    socNow -= (toStationKm / deratedFullRangeKm) * 100;
    drivenKm += toStationKm;
    kmFromStart = alongKm;
    kmLeft = distanceKm - alongKm;

    const arriveSoc = Math.max(arrivalSocPct, Math.round(socNow));

    // Leaving costs the way back onto the route, then the rest of the trip.
    const remainingNeededPct =
      ((kmLeft + offRouteKm) / deratedFullRangeKm) * 100 + arrivalSocPct;
    // The strategy's charge target is a ceiling, but it is applied last, so a low
  // target (economy is 55) combined with a high arrival SoC could clamp
  // departure BELOW arrival — a stop that reported negative energy, negative
  // cost and zero minutes. Leaving with less than you arrived with is not a
  // charging stop, so never let the ceiling push below arrival.
  const departSoc = Math.max(
    arriveSoc,
    Math.min(chargeTarget, Math.max(arriveSoc + 5, Math.min(95, Math.ceil(remainingNeededPct)))),
  );
    const energyAddedKwh = ((departSoc - arriveSoc) / 100) * spec.batteryCapacityKwh;
    // SoC-dependent charge curve (ABRP-style) instead of a flat average rate —
    // fast when topping up from low, tapering past ~50–60%.
    const rawChargingMinutes = chargeMinutes(
      arriveSoc,
      departSoc,
      spec.batteryCapacityKwh,
      chosen.maxKw,
      spec.maxDcChargingRateKw,
    );
    // Rounding to whole minutes can imply a power the hardware cannot deliver:
    // a 4.5 kWh top-up taking 1.08 minutes rounds to 1, which reads back as
    // 270 kW on a 250 kW cap. Never round below the physical floor.
    const capKw = Math.min(chosen.maxKw, spec.maxDcChargingRateKw);
    const floorMinutes = capKw > 0 ? (energyAddedKwh / capKw) * 60 : 0;
    const chargingMinutes = Math.max(
      Math.round(rawChargingMinutes),
      Math.ceil(floorMinutes),
    );
    // Use the station's real price when available; otherwise 0 (no assumed cost shown to user)
    const costEur = chosen.priceEurKwh != null
      ? Math.round(energyAddedKwh * chosen.priceEurKwh * 100) / 100
      : 0;

    stops.push({
      station: chosen,
      arriveSoc,
      departSoc,
      energyAddedKwh: Math.round(energyAddedKwh * 10) / 10,
      chargingMinutes,
      costEur,
      // What the odometer will read: distance actually driven, detours included.
      distanceFromStartKm: Math.round(drivenKm),
      drivingMinutesFromStart: Math.round(drivenKm * minutesPerKm),
      // Driving so far plus every charge before this one — when the driver
      // physically arrives. Nothing downstream could answer "how far away is
      // the next stop" without it.
      etaMinutesFromStart: Math.round(drivenKm * minutesPerKm + totalChargingMinutes),
    });

    // The return leg onto the route is driven after charging.
    drivenKm += offRouteKm;
    socNow = departSoc;
    rangeNow = ((socNow - arrivalSocPct) / 100) * deratedFullRangeKm;
    totalChargingMinutes += chargingMinutes;
    totalChargingCostEur += costEur;
    totalEnergyKwh += energyAddedKwh;
  }

  if (iter >= 30) {
    // Show the partial result with a warning rather than blocking the whole
    // plan — a nearly-complete route is still worth reviewing.
    warning = "Route planner reached stop limit; some legs near the destination may be approximate.";
    // ...but hitting the limit means the destination was never reached, so the
    // plan must not be handed to the UI as feasible. It was: a 2000 km route in
    // a 100 km-range car ended nearly 200 km short and still rendered as a
    // normal, drivable plan.
    feasible = false;
  }

  // Second pass: re-route THROUGH the chosen charging stops so the polyline
  // actually passes through each station and distance/time reflect the detours.
  let finalDistanceKm = distanceKm;
  let finalDrivingMinutes = drivingMinutes;
  let finalPolyline = polyline;
  // Traffic delay (minutes) already baked into drivingMinutes when the provider
  // is traffic-aware (TomTom). Carried from the base route, refined by via-route.
  let trafficDelayMinutes = input.baseRoute?.trafficDelayMinutes ?? 0;
  if (feasible && stops.length > 0) {
    const via = await computeRouteVia([
      origin,
      ...stops.map((s) => ({ lat: s.station.lat, lng: s.station.lng })),
      destination,
    ]);
    if (via.distanceKm > 0) {
      finalDistanceKm = via.distanceKm;
      finalDrivingMinutes = via.drivingMinutes;
      trafficDelayMinutes = via.trafficDelayMinutes ?? trafficDelayMinutes;
      // Keep the base-route polyline when via-routing fails (OSRM down) —
      // better to show the correct road without stop-detours than a straight line.
      finalPolyline = via.polyline ?? polyline;

      // Rescale the per-stop numbers onto the route that will actually be
      // reported. They were computed against the base route plus straight-line
      // detours; the via-route knows the real roads, and until now only the
      // TOTALS were updated. That left a stop claiming 270 km on a route
      // reported as 251 km — a stop further from the start than the trip is
      // long, which is what `distanceFromStartKm <= totalDistanceKm` caught.
      //
      // Proportional, not exact: OsrmResult carries no per-leg breakdown, so
      // this preserves the ordering and the ratios rather than inventing leg
      // distances. Exact per-stop legs need the provider to return them.
      if (drivenKm > 0) {
        const scale = finalDistanceKm / drivenKm;
        const paceAfter = finalDistanceKm > 0 ? finalDrivingMinutes / finalDistanceKm : 0;
        let chargedBefore = 0;
        for (const stop of stops) {
          stop.distanceFromStartKm = Math.round(stop.distanceFromStartKm * scale);
          stop.drivingMinutesFromStart = Math.round(stop.distanceFromStartKm * paceAfter);
          stop.etaMinutesFromStart = stop.drivingMinutesFromStart + chargedBefore;
          chargedBefore += stop.chargingMinutes;
        }
      }
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
    trafficDelayMinutes: Math.max(0, Math.round(trafficDelayMinutes)),
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
  { id: "economy", target: 55 },  // top up minimum — many very short stops
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

  // Keep distinct options only. The signature leads with the road alternative
  // index so genuinely different roads NEVER collapse into one variant, even
  // when they happen to share the same stops, distance and time bucket
  // (e.g. two motorway corridors Florești → Paris). Within the SAME road, the
  // plan-output part (rounded distance + exact set of charging stops + rounded
  // total time) still collapses two strategies that yield identical plans —
  // which previously showed up as two visually identical variants ("Fastest"
  // and "Fewest stops" both 476 km · 1 stop · €12.36).
  const seen = new Set<string>();
  const distinct = built
    .sort((a, b) => a.plan.totalMinutes - b.plan.totalMinutes)
    .filter((v) => {
      const stopIds = v.plan.stops.map((s) => s.station.id).join(",");
      const sig = `${v.roadIndex}-${Math.round(v.plan.totalDistanceKm)}-${stopIds}-${Math.round(v.plan.totalMinutes / 5)}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    })
    .slice(0, 6);

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
