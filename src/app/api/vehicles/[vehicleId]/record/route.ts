import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * What we actually know about someone's own car.
 *
 * The dashboard used to be a battery screen, which made sense while there was a
 * car to read. For a vehicle that is a record — documents, costs and odometer
 * readings, no telemetry — a battery hero has nothing to put in it, and the
 * honest empty version of it is a blank page with a green "Live" badge, which
 * is what shipped.
 *
 * These are the three things worth opening the app for, and all three come from
 * paperwork the driver has already given us:
 *
 *   · the odometer, and when it was last read;
 *   · what the car has cost this calendar month;
 *   · the next document to expire — RCA, ITP, rovinietă.
 *
 * The third is the one that earns the subscription. Nobody pays to look at a
 * number; they pay not to be fined.
 */
export interface VehicleRecord {
  odometerKm: number | null;
  odometerAt: string | null;
  monthCostRon: number | null;
  nextDeadline: { type: string; validUntil: string; daysLeft: number } | null;
}

export async function GET(
  _req: Request,
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

  if (!(await checkRateLimit(session.user.id, "vehicle-record", 120))) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();

  // Ownership first, and every query below is scoped by the vehicle it proved.
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [readingRes, costRes, deadlineRes] = await Promise.all([
    supabase
      .from("odometer_readings")
      .select("km, recorded_at")
      .eq("vehicle_id", vehicleId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("energy_costs")
      .select("cost_ron")
      .eq("vehicle_id", vehicleId)
      .gte("period_start", monthStart),
    // Soonest expiry that has not already passed. An expired document is a
    // different problem and belongs on the documents screen, not on a card
    // whose job is "what is coming".
    //
    // The type is on `documents` and the expiry on `vehicle_doc_meta`, joined
    // by document_id — the two halves of one fact live in two tables.
    supabase
      .from("vehicle_doc_meta")
      .select("valid_until, documents!inner(document_type)")
      .eq("vehicle_id", vehicleId)
      .not("valid_until", "is", null)
      .gte("valid_until", today)
      .order("valid_until", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const reading = readingRes.data as { km: number; recorded_at: string } | null;
  const costs = (costRes.data ?? []) as { cost_ron: number | null }[];
  const deadline = deadlineRes.data as
    | { valid_until: string; documents: { document_type: string | null } | null }
    | null;

  // Null rather than zero when there is nothing: a month with no documents
  // uploaded has an unknown cost, not a cost of nothing, and "0 lei" would be
  // the more confident of the two wrong answers.
  const monthCostRon =
    costs.length > 0
      ? costs.reduce((sum, c) => sum + (c.cost_ron ?? 0), 0)
      : null;

  const record: VehicleRecord = {
    odometerKm: reading?.km ?? null,
    odometerAt: reading?.recorded_at ?? null,
    monthCostRon,
    nextDeadline: deadline
      ? {
          type: deadline.documents?.document_type ?? "unknown",
          validUntil: deadline.valid_until,
          daysLeft: Math.ceil(
            (new Date(deadline.valid_until).getTime() - now.getTime()) / 86_400_000,
          ),
        }
      : null,
  };

  return NextResponse.json(record);
}
