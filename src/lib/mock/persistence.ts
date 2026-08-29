// =============================================================================
// Mock simulator persistence layer.
// Reads/writes mock_vehicle_state; detects session boundaries and records
// charging_sessions, trips, and command_events.
// Uses the Supabase service-role client (bypasses RLS).
// =============================================================================

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { seasonalTempC } from "@/lib/external/weather/providers/mock-weather";
import type { MockVehicleSnapshot } from "./types";
import type { VehicleState } from "@/types/vehicle";
import type { CommandName } from "@/types/history";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// EV energy consumption rises in the cold (battery chemistry + cabin heating)
// and, more mildly, in extreme heat (AC). Returns a multiplier on the nominal
// efficiency: 1.0 at the ~15°C sweet spot, up to ~1.6 in deep cold.
function tempEfficiencyFactor(tempC: number): number {
  const cold = Math.max(0, 15 - tempC) * 0.012;
  const heat = Math.max(0, tempC - 25) * 0.006;
  return Math.min(1.6, Math.max(0.9, 1 + cold + heat));
}

// One snapshot row per 10-minute wall-clock bucket. Bounds row growth on the
// hot state endpoint without needing an extra read or a stored timestamp.
function crossedSnapshotBucket(prevIso: string, nextIso: string): boolean {
  const BUCKET_MS = 10 * 60_000;
  return (
    Math.floor(new Date(prevIso).getTime() / BUCKET_MS) !==
    Math.floor(new Date(nextIso).getTime() / BUCKET_MS)
  );
}

// Coerce a possibly-stringified JSONB numeric back to a finite number.
// Guards against legacy/corrupted rows where arithmetic produced string
// concatenation (e.g. batteryLevel stored as "00700370370365").
function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Return n if it sits within [min,max]; otherwise it's corrupted — use fallback.
function inRangeOr(n: number, min: number, max: number, fallback: number): number {
  return n >= min && n <= max ? n : fallback;
}

// Repair the numeric fields of a loaded state so the engine never operates on
// strings (which would concatenate) or out-of-range values. A value outside the
// plausible band is treated as corruption and reset to a sane default rather
// than clamped (clamping a huge number to 100 would falsely show a full
// battery). Self-heals on the next saveSnapshot.
function sanitizeState(state: VehicleState): VehicleState {
  const battery = inRangeOr(num(state.batteryLevel, 65), 0, 100, 65);
  const chargeLimit = inRangeOr(num(state.chargeLimit, 80), 50, 100, 80);
  return {
    ...state,
    batteryLevel: battery,
    chargeLimit,
    odometerKm: state.odometerKm != null ? num(state.odometerKm, 0) : state.odometerKm,
    batteryRangeKm:
      state.batteryRangeKm != null ? num(state.batteryRangeKm, 0) : state.batteryRangeKm,
    chargingRateKw:
      state.chargingRateKw != null ? num(state.chargingRateKw, 0) : state.chargingRateKw,
    // A field added after a snapshot was written is simply absent from the
    // stored JSON, so every simulated car created before it existed would show
    // no chemistry — a new feature that appears only for new vehicles. Every
    // simulated model charges on the NMC curve, so this is the truth for all of
    // them, and it self-heals on the next save.
    batteryChemistry: state.batteryChemistry ?? "nmc",
    trimBadge: state.trimBadge ?? null,
  };
}

export async function loadSnapshot(
  vehicleId: string,
): Promise<MockVehicleSnapshot | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mock_vehicle_state")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    state: sanitizeState(data.state),
    motionState: data.motion_state,
    scenarioId: data.scenario_id,
    lastTickAt: data.last_tick_at,
    vehicleSpec: data.vehicle_spec ?? null,
    activeChargingSessionStart: data.active_charging_session_start,
    activeChargingSessionNetwork: data.active_charging_session_network,
    activeChargingSessionStartSoc: data.active_charging_session_start_soc,
    activeTripStart: data.active_trip_start,
    activeTripStartLat: data.active_trip_start_lat,
    activeTripStartLng: data.active_trip_start_lng,
    activeTripStartOdometerKm: data.active_trip_start_odometer_km,
  };
}

export async function saveSnapshot(
  vehicleId: string,
  prev: MockVehicleSnapshot | null,
  next: MockVehicleSnapshot,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const sanitized: MockVehicleSnapshot = { ...next, state: sanitizeState(next.state) };

  // Detect session boundaries by comparing open-session fields
  if (prev) {
    await maybeCloseChargingSession(supabase, vehicleId, prev, sanitized);
    await maybeCloseTrip(supabase, vehicleId, prev, sanitized);
    await maybeRecordSnapshot(supabase, vehicleId, prev, sanitized);
  }

  // Upsert the snapshot row
  await supabase.from("mock_vehicle_state").upsert({
    vehicle_id: vehicleId,
    state: sanitized.state,
    motion_state: sanitized.motionState,
    scenario_id: sanitized.scenarioId,
    last_tick_at: sanitized.lastTickAt,
    vehicle_spec: sanitized.vehicleSpec ?? null,
    active_charging_session_start: sanitized.activeChargingSessionStart,
    active_charging_session_network: sanitized.activeChargingSessionNetwork,
    active_charging_session_start_soc: sanitized.activeChargingSessionStartSoc,
    active_trip_start: sanitized.activeTripStart,
    active_trip_start_lat: sanitized.activeTripStartLat,
    active_trip_start_lng: sanitized.activeTripStartLng,
    active_trip_start_odometer_km: sanitized.activeTripStartOdometerKm,
  });
}

// ---------------------------------------------------------------------------
// Session closure helpers
// ---------------------------------------------------------------------------

async function maybeCloseChargingSession(
  supabase: AdminClient,
  vehicleId: string,
  prev: MockVehicleSnapshot,
  next: MockVehicleSnapshot,
): Promise<void> {
  // Charging session was open and is now closed
  if (!prev.activeChargingSessionStart || next.activeChargingSessionStart) return;

  const endSoc = next.state.batteryLevel ?? null;
  // Use the vehicle spec (real battery capacity) to compute kWh added
  // from the SoC delta. Falls back to scenario default if spec missing.
  const batteryCapacityKwh = next.vehicleSpec?.batteryCapacityKwh ?? null;
  const energyAdded =
    prev.activeChargingSessionStartSoc != null && endSoc != null && batteryCapacityKwh
      ? ((endSoc - prev.activeChargingSessionStartSoc) / 100) * batteryCapacityKwh
      : null;

  await supabase.from("charging_sessions").insert({
    vehicle_id: vehicleId,
    started_at: prev.activeChargingSessionStart,
    ended_at: next.lastTickAt,
    energy_added_kwh: energyAdded != null ? Math.round(energyAdded * 10) / 10 : null,
    start_soc: prev.activeChargingSessionStartSoc,
    end_soc: endSoc,
    network: prev.activeChargingSessionNetwork,
    cost_eur: null,
    location_lat: next.state.latitude,
    location_lng: next.state.longitude,
    location_name: null,
    max_charging_rate_kw: prev.state.chargingRateKw,
  });
}

async function maybeCloseTrip(
  supabase: AdminClient,
  vehicleId: string,
  prev: MockVehicleSnapshot,
  next: MockVehicleSnapshot,
): Promise<void> {
  // Trip was open and is now closed
  if (!prev.activeTripStart || next.activeTripStart) return;

  const distKm =
    prev.activeTripStartOdometerKm != null && next.state.odometerKm != null
      ? next.state.odometerKm - prev.activeTripStartOdometerKm
      : null;

  const durationSeconds =
    (new Date(next.lastTickAt).getTime() - new Date(prev.activeTripStart).getTime()) / 1000;

  const avgSpeedKmh =
    distKm != null && durationSeconds > 0
      ? (distKm / durationSeconds) * 3600
      : null;

  // Energy + efficiency, temperature-adjusted. The cold penalty makes the
  // efficiency-vs-temperature analysis on the insights page meaningful.
  const nominalEff = next.vehicleSpec?.efficiencyKwhPer100km ?? null;
  let energyUsedKwh: number | null = null;
  let efficiencyKwhPer100km: number | null = null;
  if (distKm != null && distKm > 0 && nominalEff != null) {
    const tempC = seasonalTempC(
      next.state.latitude ?? 48,
      new Date(next.lastTickAt),
    );
    const adjustedEff = nominalEff * tempEfficiencyFactor(tempC);
    efficiencyKwhPer100km = Math.round(adjustedEff * 100) / 100;
    energyUsedKwh = Math.round((distKm / 100) * adjustedEff * 100) / 100;
  }

  await supabase.from("trips").insert({
    vehicle_id: vehicleId,
    started_at: prev.activeTripStart,
    ended_at: next.lastTickAt,
    start_lat: prev.activeTripStartLat,
    start_lng: prev.activeTripStartLng,
    end_lat: next.state.latitude,
    end_lng: next.state.longitude,
    start_address: null,
    end_address: null,
    distance_km: distKm != null ? Math.round(distKm * 10) / 10 : null,
    start_odometer_km: prev.activeTripStartOdometerKm,
    end_odometer_km: next.state.odometerKm,
    energy_used_kwh: energyUsedKwh,
    avg_speed_kmh: avgSpeedKmh != null ? Math.round(avgSpeedKmh * 10) / 10 : null,
    max_speed_kmh: null,
    efficiency_kwh_per_100km: efficiencyKwhPer100km,
  });
}

// ---------------------------------------------------------------------------
// Snapshot history — powers vampire-drain, SoH and efficiency-vs-temp charts.
// ---------------------------------------------------------------------------

async function maybeRecordSnapshot(
  supabase: AdminClient,
  vehicleId: string,
  prev: MockVehicleSnapshot,
  next: MockVehicleSnapshot,
): Promise<void> {
  if (!crossedSnapshotBucket(prev.lastTickAt, next.lastTickAt)) return;

  const s = next.state;
  await supabase.from("vehicle_snapshots").insert({
    vehicle_id: vehicleId,
    battery_level: s.batteryLevel != null ? Math.round(s.batteryLevel) : null,
    battery_range_km: s.batteryRangeKm ?? null,
    odometer_km: s.odometerKm ?? null,
    interior_temp_c: s.interiorTempC ?? null,
    exterior_temp_c:
      s.latitude != null ? seasonalTempC(s.latitude, new Date(next.lastTickAt)) : null,
    is_locked: s.isLocked ?? null,
    is_charging: s.chargingState === "charging",
    charging_rate_kw: s.chargingRateKw ?? null,
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
    recorded_at: next.lastTickAt,
  });
}

export async function recordCommandEvent(
  vehicleId: string,
  command: CommandName,
  args: Record<string, unknown> | null,
  success: boolean,
  errorCode: string | null,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.from("command_events").insert({
    vehicle_id: vehicleId,
    command,
    args,
    success,
    error_code: errorCode,
    source: "user",
    issued_at: new Date().toISOString(),
  });
}
