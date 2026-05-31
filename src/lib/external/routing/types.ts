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
  stops: ChargingStop[];
  feasible: boolean;
  warning: string | null;
  polyline: { type: "LineString"; coordinates: [number, number][] } | null;
  approxRoute: boolean;
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
