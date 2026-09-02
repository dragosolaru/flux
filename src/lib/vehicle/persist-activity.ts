import type { SupabaseClient } from "@supabase/supabase-js";

import { getModelSpec } from "@/lib/brands/models";
import { deriveActivity, type ActivitySnapshot } from "./derive-activity";

/**
 * Runs the derivation for one vehicle and writes what it found.
 *
 * Re-running is the normal case, not an error path: a trip that was still in
 * progress on the last pass has more snapshots now, and must grow rather than
 * appear twice. That is what the partial unique indexes on
 * `(vehicle_id, started_at) where source = 'derived'` are for — every write here
 * is an upsert on that key, so a pass is idempotent and a growing period
 * updates in place.
 *
 * Only rows marked `source = 'derived'` are ever touched. Simulated and seeded
 * rows have a null source and are outside the index, so a mock vehicle's
 * history cannot be overwritten by this.
 */

/**
 * How far back a pass looks.
 *
 * Not a watermark: a fixed trailing window is self-healing. If a pass failed, or
 * ran while a trip was half-recorded, or the derivation rules changed, the next
 * pass simply recomputes the window and the upserts settle it. A watermark
 * would have to be right forever; this only has to be re-run.
 */
const WINDOW_DAYS = 30;

/** Bound on one pass, so a chatty vehicle cannot make the cron unbounded. */
const MAX_SNAPSHOTS = 5000;

interface SnapshotRow {
  battery_level: number | null;
  odometer_km: number | null;
  is_charging: boolean | null;
  charging_rate_kw: number | null;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string;
}

export interface DerivationResult {
  trips: number;
  sessions: number;
  snapshots: number;
}

export async function deriveAndStoreActivity(
  supabase: SupabaseClient,
  vehicle: { id: string; brand: string; model: string | null },
): Promise<DerivationResult> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("vehicle_snapshots")
    .select("battery_level, odometer_km, is_charging, charging_rate_kw, latitude, longitude, recorded_at")
    .eq("vehicle_id", vehicle.id)
    .gte("recorded_at", since)
    // Oldest first: the derivation walks forward through time.
    .order("recorded_at", { ascending: true })
    .limit(MAX_SNAPSHOTS);

  if (error) throw new Error(`snapshots: ${error.message}`);

  const rows = (data ?? []) as SnapshotRow[];
  if (rows.length < 2) return { trips: 0, sessions: 0, snapshots: rows.length };

  const snapshots: ActivitySnapshot[] = rows.map((r) => ({
    recordedAt: r.recorded_at,
    batteryLevel: r.battery_level,
    odometerKm: r.odometer_km,
    isCharging: r.is_charging,
    chargingRateKw: r.charging_rate_kw,
    latitude: r.latitude,
    longitude: r.longitude,
  }));

  const spec = getModelSpec(vehicle.brand, vehicle.model);
  const { trips, sessions } = deriveActivity(snapshots, spec.batteryCapacityKwh);

  if (trips.length > 0) {
    const { error: tripErr } = await supabase.from("trips").upsert(
      trips.map((t) => ({
        vehicle_id: vehicle.id,
        source: "derived",
        started_at: t.startedAt,
        ended_at: t.endedAt,
        distance_km: t.distanceKm,
        energy_used_kwh: t.energyUsedKwh,
        avg_speed_kmh: t.avgSpeedKmh,
        efficiency_kwh_per_100km: t.efficiencyKwhPer100km,
        start_lat: t.startLat,
        start_lng: t.startLng,
        end_lat: t.endLat,
        end_lng: t.endLng,
      })),
      { onConflict: "vehicle_id,started_at" },
    );
    if (tripErr) throw new Error(`trips: ${tripErr.message}`);
  }

  if (sessions.length > 0) {
    const { error: sessionErr } = await supabase.from("charging_sessions").upsert(
      sessions.map((s) => ({
        vehicle_id: vehicle.id,
        source: "derived",
        started_at: s.startedAt,
        ended_at: s.endedAt,
        start_soc: s.startSoc,
        end_soc: s.endSoc,
        energy_added_kwh: s.energyAddedKwh,
        max_charging_rate_kw: s.maxChargingRateKw,
        location_lat: s.locationLat,
        location_lng: s.locationLng,
      })),
      { onConflict: "vehicle_id,started_at" },
    );
    if (sessionErr) throw new Error(`charging_sessions: ${sessionErr.message}`);
  }

  return { trips: trips.length, sessions: sessions.length, snapshots: rows.length };
}
