import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { mockWeather } from "@/lib/external/weather/providers/mock-weather";
import { derateRange } from "@/lib/external/weather/derating";

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

  // Verify vehicle belongs to user FIRST — prevents leaking state for foreign vehicles
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  // Then pull current vehicle state for lat/lng and range
  const { data: stateRow } = await supabase
    .from("mock_vehicle_state")
    .select("state")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  const state = stateRow?.state as { latitude?: number; longitude?: number; batteryRangeKm?: number } | null;
  const lat = state?.latitude ?? 50.0;
  const lng = state?.longitude ?? 14.4;
  const idealKm = state?.batteryRangeKm ?? null;

  const weather = mockWeather.getCurrent(lat, lng);
  const derating = idealKm != null ? derateRange(idealKm, weather) : null;

  return NextResponse.json({ weather, derating });
}
