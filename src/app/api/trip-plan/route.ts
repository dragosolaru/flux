import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getModelSpec } from "@/lib/brands/models";
import { mockWeather } from "@/lib/external/weather/providers/mock-weather";
import { derateRange } from "@/lib/external/weather/derating";
import { STATIONS } from "@/lib/external/charging-networks/stations";
import { planTrip } from "@/lib/external/routing/planner";
import type { BrandKey } from "@/lib/brands/types";

const bodySchema = z.object({
  vehicleId: z.string().uuid(),
  destination: z.object({
    lat: z.number(),
    lng: z.number(),
    label: z.string().optional(),
  }),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "invalid-body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { vehicleId, destination } = parsed.data;
  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, brand, model, display_name, nickname")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  const { data: stateRow } = await supabase
    .from("mock_vehicle_state")
    .select("state")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  const state = stateRow?.state as { latitude?: number; longitude?: number; batteryLevel?: number } | null;
  if (!state || state.latitude == null || state.longitude == null || state.batteryLevel == null) {
    return NextResponse.json({ message: "vehicle-state-unavailable" }, { status: 400 });
  }

  const origin = { lat: state.latitude, lng: state.longitude, label: vehicle.nickname ?? vehicle.display_name };
  const spec = getModelSpec(vehicle.brand as BrandKey, vehicle.model);
  const weather = mockWeather.getCurrent(origin.lat, origin.lng);
  const idealKm = (spec.batteryCapacityKwh / spec.efficiencyKwhPer100km) * 100;
  const derating = derateRange(idealKm, weather);

  const plan = planTrip({
    origin,
    destination,
    spec,
    currentSocPct: state.batteryLevel,
    deratingPct: derating.totalPct,
    stations: STATIONS,
  });

  return NextResponse.json({
    plan,
    vehicle: {
      id: vehicle.id,
      displayName: vehicle.nickname ?? vehicle.display_name,
      brand: vehicle.brand,
      model: vehicle.model,
    },
    deratingPct: derating.totalPct,
  });
}
