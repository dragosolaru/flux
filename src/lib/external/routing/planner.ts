import type { ChargingStation } from "@/lib/external/charging-networks/types";
import type { ModelSpec } from "@/lib/brands/models";
import type { ChargingStop, RoutePoint, TripPlan } from "./types";
import { haversine } from "./providers/mock-router";
import { computeOsrmRoute } from "./providers/osrm-router";

const SAFETY_RESERVE_PCT = 10;   // Minimum SoC to arrive at any waypoint
const DEFAULT_CHARGE_TARGET = 80; // Default SoC to charge up to mid-trip

interface PlanInput {
  origin: RoutePoint;
  destination: RoutePoint;
  spec: ModelSpec;
  currentSocPct: number;
  deratingPct?: number; // negative = reduction (e.g. -10 for −10%)
  stations: ChargingStation[];
}

/**
 * Compute a trip plan with charging stops inserted when needed.
 * Algorithm: walk along the great-circle route in segments equal to derated
 * range × safety factor. At each "running out" point, find the nearest station
 * within reasonable detour from the next waypoint and stop there.
 */
export async function planTrip(input: PlanInput): Promise<TripPlan> {
  const { origin, destination, spec, currentSocPct, deratingPct = 0, stations } = input;

  const osrm = await computeOsrmRoute(origin, destination);
  const { distanceKm, drivingMinutes } = osrm;

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
    // Approximate point along the great-circle line at `kmFromStart + rangeNow * 0.85`
    const targetKm = kmFromStart + rangeNow * 0.85;
    const t = Math.min(1, targetKm / distanceKm);
    const targetLat = origin.lat + (destination.lat - origin.lat) * t;
    const targetLng = origin.lng + (destination.lng - origin.lng) * t;

    // Find compatible station within 80km detour, prefer high power
    const candidates = stations
      .map((st) => ({ st, dist: haversine({ lat: targetLat, lng: targetLng }, st) }))
      .filter((c) => c.dist < 80)
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

    // Charge to either 80% or enough for remaining (with reserve) — whichever is less
    const remainingNeededPct = ((kmLeft + detourKm * 0.3) / deratedFullRangeKm) * 100 + SAFETY_RESERVE_PCT;
    const departSoc = Math.min(DEFAULT_CHARGE_TARGET, Math.max(arriveSoc + 5, Math.min(95, Math.ceil(remainingNeededPct))));
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

  return {
    origin,
    destination,
    totalDistanceKm: distanceKm,
    drivingMinutes,
    chargingMinutes: totalChargingMinutes,
    totalMinutes: drivingMinutes + totalChargingMinutes,
    totalEnergyKwh: Math.round(totalEnergyKwh * 10) / 10,
    totalChargingCostEur: Math.round(totalChargingCostEur * 100) / 100,
    stops,
    feasible,
    warning,
    polyline: osrm.polyline,
    approxRoute: osrm.polyline === null,
  };
}
