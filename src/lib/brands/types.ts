// =============================================================================
// Brand registry types.
// BrandCapabilities is the single source of truth for which telemetry fields
// and commands each brand supports. UI components and API dispatchers gate on
// these maps — never on brand identity directly.
// =============================================================================

import type { VehicleState } from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Brand identity
// ---------------------------------------------------------------------------

export type BrandKey = "tesla";

// ---------------------------------------------------------------------------
// Capability maps
// ---------------------------------------------------------------------------

export interface TelemetryCapabilities {
  // energy / battery
  batteryLevel: boolean;
  batteryRangeKm: boolean;
  chargeLimit: boolean;
  chargingState: boolean;
  chargingRateKw: boolean;
  timeToFullMinutes: boolean;
  batteryHealthPct: boolean;
  cellVoltages: boolean;
  // drive / motion
  odometer: boolean;
  speed: boolean;
  heading: boolean;
  location: boolean;
  // climate / cabin
  interiorTemp: boolean;
  exteriorTemp: boolean;
  climateOn: boolean;
  driverTempSetting: boolean;
  passengerTempSetting: boolean;
  hvacMode: boolean;
  seatHeating: boolean;
  steeringHeating: boolean;
  // body / security
  locked: boolean;
  doorsOpen: boolean;
  windowsOpen: boolean;
  trunkOpen: boolean;
  frunkOpen: boolean;
  sentryMode: boolean;
  dashcam: boolean;
  // software / health
  softwareVersion: boolean;
  updateAvailable: boolean;
  // tyre pressure
  tirePressure: boolean;
  // efficiency / scores
  safetyScore: boolean;
  efficiencyScore: boolean;
}

export interface CommandCapabilities {
  lock: boolean;
  unlock: boolean;
  climateOn: boolean;
  climateOff: boolean;
  setClimateTemp: boolean;
  honk: boolean;
  flash: boolean;
  setChargeLimit: boolean;
  setChargeAmps: boolean;
  startCharging: boolean;
  stopCharging: boolean;
  openChargePort: boolean;
  closeChargePort: boolean;
  ventWindows: boolean;
  closeWindows: boolean;
  activateSentry: boolean;
  deactivateSentry: boolean;
  remoteStart: boolean;
  scheduleCharging: boolean;
  scheduleDeparture: boolean;
  preconditionMax: boolean;
}

export type HistoryRetention =
  | "unlimited"
  | "90days"
  | "30days"
  | "7days"
  | "none";

export interface HistoryCapabilities {
  chargingSessions: boolean;
  trips: boolean;
  consumption: boolean;
  commandLog: boolean;
  retention: HistoryRetention;
}

export type RefreshModel = "polling" | "push" | "on-demand";

export interface BrandCapabilities {
  telemetry: TelemetryCapabilities;
  commands: CommandCapabilities;
  history: HistoryCapabilities;
  refreshModel: RefreshModel;
}

// ---------------------------------------------------------------------------
// Adapter — pure function mapping raw brand API output to VehicleState
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BrandAdapter = (raw: any) => Partial<VehicleState>;

// ---------------------------------------------------------------------------
// Brand profile
// ---------------------------------------------------------------------------

export interface BrandProfile {
  key: BrandKey;
  displayName: string;
  capabilities: BrandCapabilities;
  dataSource: "mock" | "live";
  adapter: BrandAdapter;
}
