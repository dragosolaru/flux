import type { SupabaseClient } from "@supabase/supabase-js";

import type { VehicleState } from "@/types/vehicle";

/**
 * The last reading a live car gave us, and how to hand it back when the car is
 * asleep.
 *
 * Before this, the live path stored nothing: `vehicle_snapshots` was written by
 * the simulator only. That is why a read of a sleeping car had to wake it —
 * there was no other answer to give. Storing what the car last said turns
 * "asleep" from a failure into a reading with a timestamp on it, which is what
 * a parked car actually is.
 *
 * It also gives linked cars the history `/insights` was computing from an empty
 * table.
 */

/** How often a live reading is written. Not every read — see saveLastKnown. */
const MIN_GAP_MS = 5 * 60 * 1000;

interface SnapshotRow {
  battery_level: number | null;
  battery_range_km: number | null;
  odometer_km: number | null;
  interior_temp_c: number | null;
  exterior_temp_c: number | null;
  is_locked: boolean | null;
  is_charging: boolean | null;
  charging_rate_kw: number | null;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string;
}

const COLUMNS =
  "battery_level, battery_range_km, odometer_km, interior_temp_c, exterior_temp_c, is_locked, is_charging, charging_rate_kw, latitude, longitude, recorded_at";

/**
 * Writes a live reading, at most once every five minutes per vehicle.
 *
 * Throttled because the point is a last-known value and a history, not a
 * transcript: while someone watches the dashboard this would otherwise insert
 * two rows a minute for a number that changes by 1% an hour.
 */
export async function saveLastKnown(
  supabase: SupabaseClient,
  vehicleId: string,
  state: VehicleState,
): Promise<void> {
  const { data: latest } = await supabase
    .from("vehicle_snapshots")
    .select("recorded_at")
    .eq("vehicle_id", vehicleId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previous = (latest as { recorded_at: string } | null)?.recorded_at;
  if (previous && Date.now() - new Date(previous).getTime() < MIN_GAP_MS) return;

  await supabase.from("vehicle_snapshots").insert({
    vehicle_id: vehicleId,
    battery_level: state.batteryLevel,
    battery_range_km: state.batteryRangeKm,
    odometer_km: state.odometerKm,
    interior_temp_c: state.interiorTempC,
    exterior_temp_c: state.exteriorTempC,
    is_locked: state.isLocked,
    is_charging: state.chargingState === "charging",
    charging_rate_kw: state.chargingRateKw,
    latitude: state.latitude,
    longitude: state.longitude,
    recorded_at: state.recordedAt,
  });
}

/**
 * Rebuilds a VehicleState from the last stored reading.
 *
 * Everything the snapshot does not carry stays null rather than being guessed.
 * A screen that shows null hides the row; a screen that showed a stale sentry
 * state as if it were current would be lying about a security setting.
 */
export async function loadLastKnown(
  supabase: SupabaseClient,
  vehicle: { id: string; brand: string; display_name: string },
): Promise<VehicleState | null> {
  const { data } = await supabase
    .from("vehicle_snapshots")
    .select(COLUMNS)
    .eq("vehicle_id", vehicle.id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as SnapshotRow | null;
  if (!row) return null;

  return {
    vehicleId: vehicle.id,
    displayName: vehicle.display_name,
    brand: vehicle.brand as VehicleState["brand"],
    dataSource: "live",

    // The whole point: the car is not online, and the reading is from when it
    // last was. `lastSeenAt` is what makes the age of it visible.
    isOnline: false,
    lastSeenAt: row.recorded_at,

    batteryLevel: row.battery_level,
    batteryRangeKm: row.battery_range_km,
    chargeLimit: null,
    chargingState: row.is_charging ? "charging" : null,
    chargingRateKw: row.charging_rate_kw,
    timeToFullMinutes: null,
    scheduledChargingEnabled: null,
    scheduledChargingStartMinutes: null,
    batteryHealthPct: null,
    cellVoltages: null,

    motionState: "parked",
    odometerKm: row.odometer_km,
    speedKmh: null,
    headingDeg: null,

    latitude: row.latitude,
    longitude: row.longitude,

    interiorTempC: row.interior_temp_c,
    exteriorTempC: row.exterior_temp_c,
    isClimateOn: null,
    driverTempC: null,
    passengerTempC: null,
    hvacMode: null,
    seatHeatingLevel: null,
    steeringHeating: null,

    isLocked: row.is_locked,
    doorsOpen: null,
    windowsOpen: null,
    isTrunkOpen: null,
    isFrunkOpen: null,
    isSentryMode: null,
    isDashcamRecording: null,
    isBatteryPreconditioning: null,

    softwareVersion: null,
    updateAvailable: null,
    updateVersionLabel: null,
    serviceDueAt: null,
    tirePressures: null,
    safetyScore: null,
    efficiencyScore: null,

    recordedAt: row.recorded_at,
  };
}
