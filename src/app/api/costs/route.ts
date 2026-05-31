import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import type { MonthlyBucket, CostAggregation } from "@/types/costs";

const PETROL_PRICE_RON = 7.5;
const PETROL_L_PER_100KM = 7;
const PETROL_COST_PER_KM = (PETROL_PRICE_RON * PETROL_L_PER_100KM) / 100;

const QuerySchema = z.object({
  vehicleId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});

interface EnergyCostRow {
  document_type: string;
  total_kwh: number | null;
  vehicle_kwh_attributed: number | null;
  cost_ron: number;
  period_start: string;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    vehicleId: searchParams.get("vehicleId"),
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  if (!parsed.success) return NextResponse.json({ message: "vehicleId required" }, { status: 400 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", parsed.data.vehicleId)
    .eq("user_id", userId)
    .single();

  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  let query = supabase
    .from("energy_costs")
    .select("document_type, total_kwh, vehicle_kwh_attributed, cost_ron, period_start")
    .eq("vehicle_id", parsed.data.vehicleId)
    .order("period_start", { ascending: false });

  if (parsed.data.from) query = query.gte("period_start", parsed.data.from);
  if (parsed.data.to) query = query.lte("period_start", parsed.data.to);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const costs = (rows ?? []) as EnergyCostRow[];

  const totalCostRon = costs.reduce((s, r) => s + r.cost_ron, 0);
  const totalKwh = costs.reduce((s, r) => s + (r.vehicle_kwh_attributed ?? r.total_kwh ?? 0), 0);
  const homeRows = costs.filter(r => r.document_type === "home_bill");
  const publicRows = costs.filter(r => r.document_type === "public_receipt");
  const homeKwh = homeRows.reduce((s, r) => s + (r.vehicle_kwh_attributed ?? 0), 0);
  const publicKwh = publicRows.reduce((s, r) => s + (r.total_kwh ?? 0), 0);
  const homeCostRon = homeRows.reduce((s, r) => s + r.cost_ron, 0);
  const publicCostRon = publicRows.reduce((s, r) => s + r.cost_ron, 0);

  // Monthly trend (last 12 months)
  const buckets = new Map<string, MonthlyBucket>();
  for (const row of costs) {
    const month = row.period_start.slice(0, 7);
    const existing = buckets.get(month) ?? { month, costRon: 0, kwh: 0, homeKwh: 0, publicKwh: 0 };
    existing.costRon += row.cost_ron;
    const kwh = row.vehicle_kwh_attributed ?? row.total_kwh ?? 0;
    existing.kwh += kwh;
    if (row.document_type === "home_bill") existing.homeKwh += kwh;
    else existing.publicKwh += kwh;
    buckets.set(month, existing);
  }

  const monthlyTrend = Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));

  // Fetch km driven in the same date window as the costs.
  // trips.started_at aligns with billing period_start.
  let tripQuery = supabase
    .from("trips")
    .select("distance_km")
    .eq("vehicle_id", parsed.data.vehicleId)
    .not("distance_km", "is", null);
  if (parsed.data.from) tripQuery = tripQuery.gte("started_at", parsed.data.from);
  if (parsed.data.to) tripQuery = tripQuery.lte("started_at", parsed.data.to);

  const { data: trips } = await tripQuery;
  const totalKm = (trips ?? []).reduce(
    (s: number, t: { distance_km: number | null }) => s + (t.distance_km ?? 0),
    0,
  );

  // For home bills, cost_ron is the full bill. Only the vehicle's attributed
  // proportion (vehicle_kwh_attributed / total_kwh) belongs to the car.
  const homeAttributedCostRon = homeRows.reduce((s, r) => {
    if (r.total_kwh && r.vehicle_kwh_attributed && r.total_kwh > 0) {
      return s + r.cost_ron * (r.vehicle_kwh_attributed / r.total_kwh);
    }
    return s + r.cost_ron;
  }, 0);
  const attributedTotalCostRon = homeAttributedCostRon + publicCostRon;

  const result: CostAggregation & { petrolEquivalentCostRon: number; totalKm: number } = {
    totalCostRon,
    totalKwh,
    homeKwh,
    publicKwh,
    homeCostRon,
    publicCostRon,
    costPerKmHome: totalKm > 0 && homeAttributedCostRon > 0 ? homeAttributedCostRon / totalKm : null,
    costPerKmPublic: totalKm > 0 && publicCostRon > 0 ? publicCostRon / totalKm : null,
    costPerKmBlended: totalKm > 0 && attributedTotalCostRon > 0 ? attributedTotalCostRon / totalKm : null,
    whPerKm: totalKm > 0 && totalKwh > 0 ? (totalKwh * 1000) / totalKm : null,
    monthlyTrend,
    petrolEquivalentCostRon: PETROL_COST_PER_KM * totalKm,
    totalKm,
  };

  return NextResponse.json(result);
}
