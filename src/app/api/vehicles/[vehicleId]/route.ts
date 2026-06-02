import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { listScenarios } from "@/lib/mock/scenarios";
import { canAddVehicle } from "@/lib/subscription";
import type { BrandKey } from "@/lib/brands/types";

const uuidSchema = z.string().uuid();
const VALID_SCENARIO_IDS = listScenarios().map((s) => s.id);

const patchBodySchema = z.object({
  virtualKeyPaired: z.boolean().optional(),
  scenarioId: z.string().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { vehicleId } = await params;
  if (!uuidSchema.safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }
  const rawBody = await req.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }
  const body = parsed.data;

  const virtualKeyPaired = body.virtualKeyPaired;
  const scenarioId = body.scenarioId;
  const isActive = body.is_active;

  if (virtualKeyPaired === undefined && scenarioId === undefined && isActive === undefined) {
    return NextResponse.json({ message: "No valid fields to update" }, { status: 400 });
  }

  // Reactivation check: free tier slot limit
  if (isActive === true) {
    const check = await canAddVehicle(session.user.id);
    if (!check.allowed) {
      return NextResponse.json({ error: "free_tier_limit" }, { status: 403 });
    }
  }

  const supabase = createSupabaseAdminClient();

  // Ownership check
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, display_name, brand, model, data_source")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .single();

  if (!vehicle) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  // Handle is_active update
  if (isActive !== undefined) {
    const { error } = await supabase
      .from("vehicles")
      .update({ is_active: isActive })
      .eq("id", vehicleId)
      .eq("user_id", session.user.id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Handle virtualKeyPaired update
  if (virtualKeyPaired !== undefined) {
    const { error } = await supabase
      .from("vehicles")
      .update({ virtual_key_paired: virtualKeyPaired })
      .eq("id", vehicleId)
      .eq("user_id", session.user.id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Handle scenario switch (mock vehicles only)
  if (scenarioId !== undefined) {
    if (vehicle.data_source !== "mock") {
      return NextResponse.json(
        { message: "Scenario switching is only available for demo vehicles" },
        { status: 400 },
      );
    }
    if (!VALID_SCENARIO_IDS.includes(scenarioId)) {
      return NextResponse.json({ message: "Invalid scenarioId" }, { status: 400 });
    }

    // Preserve current odometer from existing mock state
    const { data: existingState } = await supabase
      .from("mock_vehicle_state")
      .select("state")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();

    const rawOdometer = (existingState?.state as { odometerKm?: number } | null)?.odometerKm;
    const currentOdometer = Number.isFinite(Number(rawOdometer)) ? Number(rawOdometer) : 0;

    const snapshot = createInitialSnapshot(
      vehicleId,
      vehicle.display_name,
      vehicle.brand as BrandKey,
      scenarioId,
      vehicle.model ?? null,
    );

    // Carry over odometer so history stays consistent
    snapshot.state.odometerKm = currentOdometer;

    const { error } = await supabase.from("mock_vehicle_state").upsert({
      vehicle_id: vehicleId,
      state: snapshot.state,
      motion_state: snapshot.motionState,
      scenario_id: snapshot.scenarioId,
      last_tick_at: snapshot.lastTickAt,
      vehicle_spec: snapshot.vehicleSpec ?? null,
      active_charging_session_start: null,
      active_charging_session_network: null,
      active_charging_session_start_soc: null,
      active_trip_start: null,
      active_trip_start_lat: null,
      active_trip_start_lng: null,
      active_trip_start_odometer_km: null,
    });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!uuidSchema.safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("user_id", session.user.id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
