import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getModelSpec } from "@/lib/brands/models";
import { mockWeather } from "@/lib/external/weather/providers/mock-weather";
import { derateRange } from "@/lib/external/weather/derating";
import { STATIONS } from "@/lib/external/charging-networks/stations";
import { planTrip } from "@/lib/external/routing/planner";
import type { BrandKey } from "@/lib/brands/types";

const coordSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().optional(),
});

const bodySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  origin: coordSchema.optional(),
  startSoc: z.number().min(1).max(100).optional(),
  destination: coordSchema,
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!await checkRateLimit(session.user.id, "trip-plan", 20)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "invalid-body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { vehicleId, origin: bodyOrigin, startSoc: bodyStartSoc, destination } = parsed.data;

  if (vehicleId) {
    // Vehicle-based flow: fetch vehicle + state
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

    // Use body origin if provided, otherwise fall back to vehicle state location
    let origin: { lat: number; lng: number; label?: string };
    if (bodyOrigin) {
      origin = bodyOrigin;
    } else {
      if (!state || state.latitude == null || state.longitude == null) {
        return NextResponse.json({ message: "vehicle-state-unavailable" }, { status: 400 });
      }
      origin = { lat: state.latitude, lng: state.longitude, label: vehicle.nickname ?? vehicle.display_name };
    }

    // Use body startSoc if provided, otherwise fall back to vehicle battery level
    let currentSocPct: number;
    if (bodyStartSoc != null) {
      currentSocPct = bodyStartSoc;
    } else {
      if (!state || state.batteryLevel == null) {
        return NextResponse.json({ message: "vehicle-state-unavailable" }, { status: 400 });
      }
      currentSocPct = state.batteryLevel;
    }

    const spec = getModelSpec(vehicle.brand as BrandKey, vehicle.model);
    const weather = mockWeather.getCurrent(origin.lat, origin.lng);
    const idealKm = (spec.batteryCapacityKwh / spec.efficiencyKwhPer100km) * 100;
    const derating = derateRange(idealKm, weather);

    const plan = await planTrip({
      origin,
      destination,
      spec,
      currentSocPct,
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

  // No vehicleId: use defaults (Model 3 LR spec, startSoc 80)
  const spec = getModelSpec("tesla", "Model 3");
  const origin = bodyOrigin ?? { lat: 44.4268, lng: 26.1025, label: "Bucharest" };
  const currentSocPct = bodyStartSoc ?? 80;
  const weather = mockWeather.getCurrent(origin.lat, origin.lng);
  const idealKm = (spec.batteryCapacityKwh / spec.efficiencyKwhPer100km) * 100;
  const derating = derateRange(idealKm, weather);

  const plan = await planTrip({
    origin,
    destination,
    spec,
    currentSocPct,
    deratingPct: derating.totalPct,
    stations: STATIONS,
  });

  return NextResponse.json({
    plan,
    vehicle: null,
    deratingPct: derating.totalPct,
  });
}
