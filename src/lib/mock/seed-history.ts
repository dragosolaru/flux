// =============================================================================
// One-time demo history backfill for a freshly added mock vehicle.
//
// Populates the analytics tables (trips, charging_sessions, vehicle_snapshots,
// documents + energy_costs) with ~12 months of plausible, deterministic data so
// the Insights and Costs pages look alive on first visit instead of empty.
//
// Called once from the state route when no mock snapshot exists yet. Uses the
// service-role client (bypasses RLS). Deterministic per vehicle.
// =============================================================================

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { seasonalTempC } from "@/lib/external/weather/providers/mock-weather";
import type { ScenarioVehicle } from "./types";
import type { ChargingNetwork } from "@/types/history";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const DAYS = 365;
const HOME_PRICE_RON_PER_KWH = 1.3; // typical RO residential, incl. taxes
const PUBLIC_PRICE_RON_PER_KWH = 2.6; // DC fast-charge average

// Same cold/heat penalty as the live simulator (persistence.ts) — keeps seeded
// efficiency consistent with what ongoing driving will produce.
function tempEfficiencyFactor(tempC: number): number {
  const cold = Math.max(0, 15 - tempC) * 0.012;
  const heat = Math.max(0, tempC - 25) * 0.006;
  return Math.min(1.6, Math.max(0.9, 1 + cold + heat));
}

// Deterministic PRNG (mulberry32) seeded from the vehicle id, so each vehicle
// gets stable but distinct history across reseeds.
function makeRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TripRow {
  vehicle_id: string;
  started_at: string;
  ended_at: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_km: number;
  start_odometer_km: number;
  end_odometer_km: number;
  energy_used_kwh: number;
  avg_speed_kmh: number;
  efficiency_kwh_per_100km: number;
}

interface ChargeRow {
  vehicle_id: string;
  started_at: string;
  ended_at: string;
  energy_added_kwh: number;
  start_soc: number;
  end_soc: number;
  network: ChargingNetwork;
  cost_ron: number;
  cost_source: "tariff_estimate";
  location_lat: number;
  location_lng: number;
  is_home_charge: boolean;
  max_charging_rate_kw: number;
}

interface SnapRow {
  vehicle_id: string;
  battery_level: number;
  battery_range_km: number;
  odometer_km: number;
  exterior_temp_c: number;
  is_charging: boolean;
  latitude: number;
  longitude: number;
  recorded_at: string;
}

/**
 * Backfill ~12 months of demo history. Returns the final odometer (km) so the
 * caller can start the live state from a realistic value rather than zero.
 */
export async function seedMockHistory(
  supabase: AdminClient,
  vehicleId: string,
  userId: string,
  spec: ScenarioVehicle,
  homeLat: number,
  homeLng: number,
): Promise<number> {
  const rng = makeRng(vehicleId);
  const cap = spec.batteryCapacityKwh;
  const maxRangeKm = (cap / spec.efficiencyKwhPer100km) * 100;

  const trips: TripRow[] = [];
  const charges: ChargeRow[] = [];
  const snaps: SnapRow[] = [];

  let odo = 0;
  let soc = 80;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function dayAt(daysAgo: number, hour: number, minute = 0): Date {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  function rangeKm(s: number): number {
    return Math.round((s / 100) * maxRangeKm * 10) / 10;
  }

  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    const dow = dayAt(daysAgo, 12).getDay(); // 0=Sun … 6=Sat
    const isWeekend = dow === 0 || dow === 6;

    // Overnight home charge when low — keeps the car usable.
    if (soc < 40) {
      const start = dayAt(daysAgo, 0, Math.floor(rng() * 60));
      const startSoc = Math.round(soc);
      const endSoc = 85;
      const energy = ((endSoc - startSoc) / 100) * cap;
      const end = new Date(start.getTime() + (energy / 7.4) * 3_600_000);
      charges.push({
        vehicle_id: vehicleId,
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
        energy_added_kwh: Math.round(energy * 10) / 10,
        start_soc: startSoc,
        end_soc: endSoc,
        network: "home",
        cost_ron: Math.round(energy * HOME_PRICE_RON_PER_KWH * 100) / 100,
        cost_source: "tariff_estimate",
        location_lat: homeLat,
        location_lng: homeLng,
        is_home_charge: true,
        max_charging_rate_kw: 7.4,
      });
      soc = endSoc;
    }

    if (!isWeekend) {
      // Two commutes (morning + evening).
      for (const baseHour of [8, 18]) {
        const hour = baseHour + Math.floor(rng() * 2);
        const dist = Math.round((12 + rng() * 20) * 10) / 10;
        const start = dayAt(daysAgo, hour, Math.floor(rng() * 50));
        const speed = 30 + rng() * 16;
        const end = new Date(start.getTime() + (dist / speed) * 3_600_000);
        const tempC = seasonalTempC(homeLat, start);
        const eff = spec.efficiencyKwhPer100km * tempEfficiencyFactor(tempC);
        const energy = (dist / 100) * eff;

        trips.push({
          vehicle_id: vehicleId,
          started_at: start.toISOString(),
          ended_at: end.toISOString(),
          start_lat: homeLat,
          start_lng: homeLng,
          end_lat: homeLat + (rng() - 0.5) * 0.15,
          end_lng: homeLng + (rng() - 0.5) * 0.15,
          distance_km: dist,
          start_odometer_km: Math.round(odo * 10) / 10,
          end_odometer_km: Math.round((odo + dist) * 10) / 10,
          energy_used_kwh: Math.round(energy * 100) / 100,
          avg_speed_kmh: Math.round(speed * 10) / 10,
          efficiency_kwh_per_100km: Math.round(eff * 100) / 100,
        });
        odo += dist;
        soc -= (energy / cap) * 100;
      }

      // One daytime snapshot (vehicle in use → odometer differs from neighbours,
      // so it never pollutes the vampire-drain calculation).
      const snapAt = dayAt(daysAgo, 13, Math.floor(rng() * 50));
      snaps.push({
        vehicle_id: vehicleId,
        battery_level: Math.max(5, Math.round(soc)),
        battery_range_km: rangeKm(Math.max(5, soc)),
        odometer_km: Math.round(odo * 10) / 10,
        exterior_temp_c: seasonalTempC(homeLat, snapAt),
        is_charging: false,
        latitude: homeLat,
        longitude: homeLng,
        recorded_at: snapAt.toISOString(),
      });
    } else if (dow === 6) {
      // Saturday: emit a parked pair spanning the weekend (Sat 18:00 → Mon 06:00,
      // ~36 h, no driving in between) with a ~1% phantom drop. Pairs like this are
      // the clean signal the vampire-drain average is built from.
      const satEve = dayAt(daysAgo, 18);
      const monMorn = dayAt(daysAgo - 2, 6); // two days later
      const startSoc = Math.max(6, Math.round(soc));
      snaps.push({
        vehicle_id: vehicleId,
        battery_level: startSoc,
        battery_range_km: rangeKm(startSoc),
        odometer_km: Math.round(odo * 10) / 10,
        exterior_temp_c: seasonalTempC(homeLat, satEve),
        is_charging: false,
        latitude: homeLat,
        longitude: homeLng,
        recorded_at: satEve.toISOString(),
      });
      snaps.push({
        vehicle_id: vehicleId,
        battery_level: Math.max(5, startSoc - 1),
        battery_range_km: rangeKm(Math.max(5, startSoc - 1)),
        odometer_km: Math.round(odo * 10) / 10,
        exterior_temp_c: seasonalTempC(homeLat, monMorn),
        is_charging: false,
        latitude: homeLat,
        longitude: homeLng,
        recorded_at: monMorn.toISOString(),
      });
      soc -= 1;
    }
  }

  // Monthly home bills + a couple of public receipts → powers the Savings card
  // (honest electric cost vs petrol) and the Costs page timeline.
  const docs: {
    id: string;
    user_id: string;
    vehicle_id: string;
    source: "email";
    document_type: "home_bill" | "public_receipt";
    storage_path: string;
    mime_type: string;
    original_filename: string;
    status: "done";
    created_at: string;
  }[] = [];
  const costs: {
    document_id: string;
    vehicle_id: string;
    document_type: "home_bill" | "public_receipt";
    period_start: string;
    period_end: string;
    total_kwh: number;
    vehicle_kwh_attributed: number;
    original_amount: number;
    original_currency: string;
    exchange_rate: number;
    cost_ron: number;
    provider_name: string;
    is_manually_edited: boolean;
  }[] = [];

  function uuid(): string {
    return globalThis.crypto.randomUUID();
  }

  for (let m = 11; m >= 0; m--) {
    const periodStart = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const periodEnd = new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    const vehicleKwh = Math.round((140 + rng() * 90) * 10) / 10;
    const homeKwh = Math.round((vehicleKwh + 180 + rng() * 120) * 10) / 10;
    const docId = uuid();
    docs.push({
      id: docId,
      user_id: userId,
      vehicle_id: vehicleId,
      source: "email",
      document_type: "home_bill",
      storage_path: `seed/${vehicleId}/home-${m}.pdf`,
      mime_type: "application/pdf",
      original_filename: `Electricity bill ${periodStart.toISOString().slice(0, 7)}.pdf`,
      status: "done",
      created_at: periodEnd.toISOString(),
    });
    costs.push({
      document_id: docId,
      vehicle_id: vehicleId,
      document_type: "home_bill",
      period_start: periodStart.toISOString().slice(0, 10),
      period_end: periodEnd.toISOString().slice(0, 10),
      total_kwh: homeKwh,
      vehicle_kwh_attributed: vehicleKwh,
      original_amount: Math.round(homeKwh * HOME_PRICE_RON_PER_KWH * 100) / 100,
      original_currency: "RON",
      exchange_rate: 1,
      cost_ron: Math.round(homeKwh * HOME_PRICE_RON_PER_KWH * 100) / 100,
      provider_name: "Enel Energie",
      is_manually_edited: false,
    });

    // Occasional public fast-charge receipt.
    if (rng() > 0.55) {
      const day = 5 + Math.floor(rng() * 20);
      const receiptDate = new Date(today.getFullYear(), today.getMonth() - m, day);
      const kwh = Math.round((25 + rng() * 25) * 10) / 10;
      const rId = uuid();
      docs.push({
        id: rId,
        user_id: userId,
        vehicle_id: vehicleId,
        source: "email",
        document_type: "public_receipt",
        storage_path: `seed/${vehicleId}/public-${m}.pdf`,
        mime_type: "application/pdf",
        original_filename: `Charging receipt ${receiptDate.toISOString().slice(0, 10)}.pdf`,
        status: "done",
        created_at: receiptDate.toISOString(),
      });
      costs.push({
        document_id: rId,
        vehicle_id: vehicleId,
        document_type: "public_receipt",
        period_start: receiptDate.toISOString().slice(0, 10),
        period_end: receiptDate.toISOString().slice(0, 10),
        total_kwh: kwh,
        vehicle_kwh_attributed: kwh,
        original_amount: Math.round(kwh * PUBLIC_PRICE_RON_PER_KWH * 100) / 100,
        original_currency: "RON",
        exchange_rate: 1,
        cost_ron: Math.round(kwh * PUBLIC_PRICE_RON_PER_KWH * 100) / 100,
        provider_name: "Ionity",
        is_manually_edited: false,
      });
    }
  }

  // Batch insert. Order matters only for the documents → energy_costs FK.
  if (trips.length) await supabase.from("trips").insert(trips);
  if (charges.length) await supabase.from("charging_sessions").insert(charges);
  if (snaps.length) await supabase.from("vehicle_snapshots").insert(snaps);
  if (docs.length) await supabase.from("documents").insert(docs);
  if (costs.length) await supabase.from("energy_costs").insert(costs);

  return Math.round(odo * 10) / 10;
}
