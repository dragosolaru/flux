import type { ChargingStation } from "@/lib/external/charging-networks/types";

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface ChargingStop {
  station: ChargingStation;
  arriveSoc: number;     // SoC % when reaching this stop
  departSoc: number;     // SoC % after charging
  energyAddedKwh: number;
  chargingMinutes: number;
  costEur: number;
  distanceFromStartKm: number;
}

export interface TripPlan {
  origin: RoutePoint;
  destination: RoutePoint;
  totalDistanceKm: number;
  drivingMinutes: number;
  chargingMinutes: number;
  totalMinutes: number;
  totalEnergyKwh: number;
  totalChargingCostEur: number;
  // Total energy the car consumes to cover the whole route (distance × derated
  // consumption — accounts for weather/temperature). This is what the trip
  // costs you in energy even when no mid-trip charging is needed.
  tripEnergyKwh: number;
  // Cost to put that energy back at the home electricity price. Non-zero even
  // for short trips with zero charging stops — driving is never free.
  tripEnergyCostEur: number;
  stops: ChargingStop[];
  feasible: boolean;
  warning: string | null;
  polyline: { type: "LineString"; coordinates: [number, number][] } | null;
  approxRoute: boolean;
}

export type TripStrategy = "fastest" | "balanced";

export interface TripVariant {
  id: string;
  strategy: TripStrategy;
  roadIndex: number;
  plan: TripPlan;
}

export interface RouteProvider {
  id: string;
  displayName: string;
  /** Returns total distance in km between two points and an estimated drive time. */
  computeRoute(origin: RoutePoint, destination: RoutePoint): {
    distanceKm: number;
    drivingMinutes: number;
  };
}
