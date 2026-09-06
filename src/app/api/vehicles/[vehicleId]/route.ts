import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { listScenarios } from "@/lib/mock/scenarios";
import { canAddVehicle } from "@/lib/subscription";
import { checkRateLimit } from "@/lib/rate-limit";
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
  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
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

  const supabase = createSupabaseAdminClient();

  // Reactivation check: free tier slot limit, for the kind of vehicle this
  // actually is. Checking it as a linked car refuses a simulator against a
  // limit that was never about simulators.
  if (isActive === true) {
    const { data: existing } = await supabase
      .from("vehicles")
      .select("data_source")
      .eq("id", vehicleId)
      .eq("user_id", userId)
      .maybeSingle();
    const kind = (existing as { data_source?: string } | null)?.data_source === "mock"
      ? "mock"
      : "real";
    const check = await canAddVehicle(userId, kind);
    if (!check.allowed) {
      return NextResponse.json({ error: "free_tier_limit", message: check.message }, { status: 403 });
    }
  }

  // Ownership check
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, display_name, brand, model, data_source")
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .single();

  if (!vehicle) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  if (!await checkRateLimit(userId, "vehicle-mutate", 30)) {
    return NextResponse.json(
      { message: "Too many requests" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  // Handle is_active update
  if (isActive !== undefined) {
    const { error } = await supabase
      .from("vehicles")
      .update({ is_active: isActive })
      .eq("id", vehicleId)
      .eq("user_id", userId);
    if (error) {
      console.error("[vehicles/[vehicleId]/PATCH]", error.message);
      return NextResponse.json({ message: "Save failed" }, { status: 500 });
    }
  }

  // Handle virtualKeyPaired update
  if (virtualKeyPaired !== undefined) {
    const { error } = await supabase
      .from("vehicles")
      .update({ virtual_key_paired: virtualKeyPaired })
      .eq("id", vehicleId)
      .eq("user_id", userId);
    if (error) {
      console.error("[vehicles/[vehicleId]/PATCH]", error.message);
      return NextResponse.json({ message: "Save failed" }, { status: 500 });
    }
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

    if (error) {
      console.error("[vehicles/[vehicleId]/PATCH]", error.message);
      return NextResponse.json({ message: "Save failed" }, { status: 500 });
    }
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

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  const { vehicleId } = await params;
  if (!uuidSchema.safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }
  if (!await checkRateLimit(userId, "vehicle-mutate", 30)) {
    return NextResponse.json(
      { message: "Too many requests" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("user_id", userId);

  if (error) {
    console.error("[vehicles/[vehicleId]/DELETE]", error.message);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
