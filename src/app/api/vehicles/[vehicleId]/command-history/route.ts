import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// The audit trail for a vehicle's commands. command_events has been written on
// every command since the beginning and is included in the data export, but was
// never shown anywhere — so an owner had no way to notice an unlock they did
// not issue.
export const dynamic = "force-dynamic";

const LIMIT = 50;

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
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // command_events has no user_id of its own, so ownership is established
  // through the vehicle before anything is read.
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("command_events")
    .select("command, success, error_code, source, issued_at")
    .eq("vehicle_id", vehicleId)
    .order("issued_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    return NextResponse.json({ message: "Could not load history" }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
