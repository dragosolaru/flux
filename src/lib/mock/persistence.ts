// =============================================================================
// Mock simulator persistence layer.
// Reads/writes mock_vehicle_state; detects session boundaries and records
// charging_sessions, trips, and command_events.
// Uses the Supabase service-role client (bypasses RLS).
// =============================================================================

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { MockVehicleSnapshot } from "./types";
import type { CommandName } from "@/types/history";

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
    state: data.state,
    motionState: data.motion_state,
    scenarioId: data.scenario_id,
    lastTickAt: data.last_tick_at,
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

  // Detect session boundaries by comparing open-session fields
  if (prev) {
    await maybeCloseChargingSession(supabase, vehicleId, prev, next);
    await maybeCloseTrip(supabase, vehicleId, prev, next);
  }

  // Upsert the snapshot row
  await supabase.from("mock_vehicle_state").upsert({
    vehicle_id: vehicleId,
    state: next.state,
    motion_state: next.motionState,
    scenario_id: next.scenarioId,
    last_tick_at: next.lastTickAt,
    active_charging_session_start: next.activeChargingSessionStart,
    active_charging_session_network: next.activeChargingSessionNetwork,
    active_charging_session_start_soc: next.activeChargingSessionStartSoc,
    active_trip_start: next.activeTripStart,
    active_trip_start_lat: next.activeTripStartLat,
    active_trip_start_lng: next.activeTripStartLng,
    active_trip_start_odometer_km: next.activeTripStartOdometerKm,
  });
}

// ---------------------------------------------------------------------------
// Session closure helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function maybeCloseChargingSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  vehicleId: string,
  prev: MockVehicleSnapshot,
  next: MockVehicleSnapshot,
): Promise<void> {
  // Charging session was open and is now closed
  if (!prev.activeChargingSessionStart || next.activeChargingSessionStart) return;

  const endSoc = next.state.batteryLevel ?? null;
  const energyAdded =
    prev.activeChargingSessionStartSoc != null && endSoc != null
      ? ((endSoc - prev.activeChargingSessionStartSoc) / 100) *
        (next.state.batteryRangeKm
          ? next.state.batteryRangeKm / ((endSoc / 100) || 1) * (16 / 100)
          : 0)
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function maybeCloseTrip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
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
    energy_used_kwh: null,
    avg_speed_kmh: avgSpeedKmh != null ? Math.round(avgSpeedKmh * 10) / 10 : null,
    max_speed_kmh: null,
    efficiency_kwh_per_100km: null,
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
