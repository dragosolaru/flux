// =============================================================================
// History types: charging sessions, trips, command events, consumption records.
// These are written by the mock simulator (Phase 2) and will be populated by
// live brand adapters when live integrations are re-enabled.
// =============================================================================

export type ChargingNetwork =
  | "ionity"
  | "tesla-sc"
  | "enbw"
  | "allego"
  | "fastned"
  | "home"
  | "other";

export interface ChargingSession {
  id: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string | null;
  energyAddedKwh: number | null;
  startSoc: number | null;
  endSoc: number | null;
  network: ChargingNetwork | null;
  costEur: number | null;
  locationLat: number | null;
  locationLng: number | null;
  locationName: string | null;
  maxChargingRateKw: number | null;
}

export interface TripRecord {
  id: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceKm: number | null;
  energyUsedKwh: number | null;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  efficiencyKwhPer100km: number | null;
}

export type CommandName =
  | "lock"
  | "unlock"
  | "climate_on"
  | "climate_off"
  | "set_climate_temp"
  | "honk"
  | "flash"
  | "set_charge_limit"
  | "set_charge_amps"
  | "start_charging"
  | "stop_charging"
  | "open_charge_port"
  | "close_charge_port"
  | "vent_windows"
  | "close_windows"
  | "activate_sentry"
  | "deactivate_sentry"
  | "remote_start";

export interface CommandEvent {
  id: string;
  vehicleId: string;
  command: CommandName;
  args: Record<string, unknown> | null;
  success: boolean;
  errorCode: string | null;
  source: "user" | "automation";
  issuedAt: string;
}

export type ConsumptionPeriod = "day" | "week" | "month";

export interface ConsumptionRecord {
  vehicleId: string;
  periodStart: string;
  periodEnd: string;
  periodType: ConsumptionPeriod;
  energyUsedKwh: number;
  energyAddedKwh: number;
  distanceKm: number;
  tripsCount: number;
  chargesCount: number;
  estimatedCostEur: number | null;
  avgEfficiencyKwhPer100km: number | null;
}
