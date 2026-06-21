import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface BatteryHealthPoint {
  date: string;
  sohPct: number;
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

  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("battery_health_history")
    .select("recorded_date, soh_pct")
    .eq("vehicle_id", vehicleId)
    .order("recorded_date", { ascending: true });

  if (error) {
    console.error("[vehicles/[vehicleId]/battery-health]", error.message);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }

  const points: BatteryHealthPoint[] = (data ?? []).map(
    (r: { recorded_date: string; soh_pct: number }) => ({
      date: r.recorded_date,
      sohPct: Number(r.soh_pct),
    }),
  );

  return NextResponse.json(points);
}
