import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { TempBucket, MileagePeriod, VehicleStatsResponse } from "@/types/stats";

const TEMP_BUCKETS = [
  { label: "<0°C", min: -Infinity, max: 0 },
  { label: "0–10°C", min: 0, max: 10 },
  { label: "10–20°C", min: 10, max: 20 },
  { label: "20–30°C", min: 20, max: 30 },
  { label: ">30°C", min: 30, max: Infinity },
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "stats", 60))) {
    return NextResponse.json(
      { message: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  // Fetch in parallel
  let tripsQuery = supabase
    .from("trips")
    .select(
      "distance_km, start_odometer_km, end_odometer_km, started_at, ended_at, energy_used_kwh, efficiency_kwh_per_100km",
    )
    .eq("vehicle_id", vehicleId);
  if (from) tripsQuery = tripsQuery.gte("started_at", from);
  if (to) tripsQuery = tripsQuery.lte("started_at", to);

  let chargesQuery = supabase
    .from("charging_sessions")
    .select("started_at, ended_at, energy_added_kwh")
    .eq("vehicle_id", vehicleId);
  if (from) chargesQuery = chargesQuery.gte("started_at", from);
  if (to) chargesQuery = chargesQuery.lte("started_at", to);

  // Snapshots for vampire drain + temp correlation — limit to keep response fast
  let snapsQuery = supabase
    .from("vehicle_snapshots")
    .select("battery_level, exterior_temp_c, is_charging, odometer_km, recorded_at")
    .eq("vehicle_id", vehicleId)
    .order("recorded_at", { ascending: true })
    .limit(2000);
  if (from) snapsQuery = snapsQuery.gte("recorded_at", from);
  if (to) snapsQuery = snapsQuery.lte("recorded_at", to);

  const [{ data: trips }, { data: charges }, { data: snapshots }] = await Promise.all([
    tripsQuery,
    chargesQuery,
    snapsQuery,
  ]);

  const tripsData = (trips ?? []) as {
    distance_km: number | null;
    start_odometer_km: number | null;
    end_odometer_km: number | null;
    started_at: string;
    ended_at: string | null;
    energy_used_kwh: number | null;
    efficiency_kwh_per_100km: number | null;
  }[];

  const chargesData = (charges ?? []) as {
    started_at: string;
    ended_at: string | null;
    energy_added_kwh: number | null;
  }[];

  const snapsData = (snapshots ?? []) as {
    battery_level: number | null;
    exterior_temp_c: number | null;
    is_charging: boolean | null;
    odometer_km: number | null;
    recorded_at: string;
  }[];

  // ─── Trips aggregate ───────────────────────────────────────────────────────

  function tripKm(t: (typeof tripsData)[number]): number {
    return (
      t.distance_km ??
      (t.end_odometer_km != null && t.start_odometer_km != null
        ? t.end_odometer_km - t.start_odometer_km
        : 0)
    );
  }

  const totalDrivingKm = tripsData.reduce((s, t) => s + tripKm(t), 0);

  const totalDrivingH = tripsData.reduce((s, t) => {
    if (!t.ended_at) return s;
    const h = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3_600_000;
    return s + (h > 0 ? h : 0);
  }, 0);

  const tripCount = tripsData.length;
  const avgTripKm = tripCount > 0 ? totalDrivingKm / tripCount : null;

  // ─── Charging aggregate ─────────────────────────────────────────────────────

  const totalChargingH = chargesData.reduce((s, c) => {
    if (!c.ended_at) return s;
    const h = (new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 3_600_000;
    return s + (h > 0 ? h : 0);
  }, 0);

  const totalEnergyAddedKwh = chargesData.reduce((s, c) => s + (c.energy_added_kwh ?? 0), 0);
  const chargingSessionCount = chargesData.length;

  // ─── Efficiency average ─────────────────────────────────────────────────────

  const totalKwh = tripsData.reduce((s, t) => s + (t.energy_used_kwh ?? 0), 0);
  const avgWhPerKm =
    totalDrivingKm > 0 && totalKwh > 0 ? (totalKwh * 1000) / totalDrivingKm : null;

  // ─── Efficiency by temperature ──────────────────────────────────────────────

  const bucketAccum = TEMP_BUCKETS.map(() => ({ sumWh: 0, count: 0 }));

  for (const trip of tripsData) {
    if (!trip.efficiency_kwh_per_100km) continue;
    const whPerKm = trip.efficiency_kwh_per_100km * 10;

    // Find closest snapshot to trip start (within 2 h)
    const tripStartMs = new Date(trip.started_at).getTime();
    let nearestTemp: number | null = null;
    let nearestDiff = Infinity;
    for (const snap of snapsData) {
      if (snap.exterior_temp_c == null) continue;
      const diff = Math.abs(new Date(snap.recorded_at).getTime() - tripStartMs);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestTemp = snap.exterior_temp_c;
      }
    }
    if (nearestTemp == null || nearestDiff > 2 * 3_600_000) continue;

    for (let i = 0; i < TEMP_BUCKETS.length; i++) {
      if (nearestTemp >= TEMP_BUCKETS[i].min && nearestTemp < TEMP_BUCKETS[i].max) {
        bucketAccum[i].sumWh += whPerKm;
        bucketAccum[i].count++;
        break;
      }
    }
  }

  const efficiencyByTemp: TempBucket[] = TEMP_BUCKETS.map((b, i) => ({
    label: b.label,
    avgWhPerKm: bucketAccum[i].count > 0 ? bucketAccum[i].sumWh / bucketAccum[i].count : 0,
    count: bucketAccum[i].count,
  })).filter((b) => b.count > 0);

  // ─── Vampire drain ──────────────────────────────────────────────────────────
  // Average %/h lost while parked (not driving, not charging). All idle windows
  // count toward the denominator — including flat ones — so the integer-rounded
  // battery_level doesn't bias the rate upward by only sampling drops.

  let vampireDropSum = 0;
  let vampireHours = 0;

  for (let i = 1; i < snapsData.length; i++) {
    const prev = snapsData[i - 1];
    const curr = snapsData[i];
    if (!prev || !curr) continue;
    if (prev.is_charging || curr.is_charging) continue;
    if (prev.battery_level == null || curr.battery_level == null) continue;

    // Skip windows where the car moved — that's driving drain, not vampire.
    if (
      prev.odometer_km != null &&
      curr.odometer_km != null &&
      curr.odometer_km - prev.odometer_km > 0.1
    ) {
      continue;
    }

    const h =
      (new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 3_600_000;
    if (h <= 0 || h > 12) continue;

    const drop = prev.battery_level - curr.battery_level;
    if (drop < 0) continue; // battery rose → unrecorded charge; skip the pair

    vampireDropSum += drop;
    vampireHours += h;
  }

  const vampireDrainPctPerH = vampireHours > 0 ? vampireDropSum / vampireHours : null;

  // ─── Mileage by month ──────────────────────────────────────────────────────

  const monthMap = new Map<string, number>();
  for (const trip of tripsData) {
    const month = trip.started_at.slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + tripKm(trip));
  }

  const mileageByMonth: MileagePeriod[] = Array.from(monthMap.entries())
    .map(([period, km]) => ({ period, km }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const result: VehicleStatsResponse = {
    totalDrivingKm,
    totalDrivingH,
    tripCount,
    avgTripKm,
    totalChargingH,
    totalEnergyAddedKwh,
    chargingSessionCount,
    avgWhPerKm,
    efficiencyByTemp,
    vampireDrainPctPerH,
    mileageByMonth,
  };

  return NextResponse.json(result);
}
