import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brands/registry";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { saveSnapshot } from "@/lib/mock/persistence";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { listScenarios } from "@/lib/mock/scenarios";
import { canAddVehicle } from "@/lib/subscription";

// GET /api/vehicles — list vehicles for the current user
// ?include_inactive=true returns all vehicles regardless of is_active
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("include_inactive") === "true";

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("vehicles")
    .select("id, brand, display_name, nickname, model, year, data_source, virtual_key_paired, is_active")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[vehicles/GET]", error.message);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json(
    (data ?? []).map((v: {
      id: string;
      brand: string;
      display_name: string;
      nickname: string | null;
      model: string | null;
      year: number | null;
      data_source: string;
      virtual_key_paired: boolean | null;
      is_active: boolean;
    }) => ({
      id: v.id,
      brand: v.brand,
      displayName: v.display_name,
      nickname: v.nickname ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      dataSource: v.data_source,
      virtualKeyPaired: v.virtual_key_paired ?? false,
      isActive: v.is_active,
    })),
  );
}

const addVehicleSchema = z.object({
  brand: z.literal("tesla"),
  nickname: z.string().min(1).max(40),
  model: z.string().min(1).max(60).optional(),
  year: z.number().int().min(2010).max(2030).optional(),
  scenarioId: z.string().default("commuter"),
});

// POST /api/vehicles — add a mock vehicle
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const parsed = addVehicleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { brand, nickname, model, year, scenarioId } = parsed.data;

  const profile = getBrand(brand);
  if (!profile) {
    return NextResponse.json({ message: "Unknown brand" }, { status: 400 });
  }

  const scenarios = listScenarios();
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0]!;

  const supabase = createSupabaseAdminClient();

  const vehicleCheck = await canAddVehicle(userId);
  if (!vehicleCheck.allowed) {
    return NextResponse.json({ message: vehicleCheck.message }, { status: 402 });
  }

  const { data: vehicle, error: insertErr } = await supabase
    .from("vehicles")
    .insert({
      user_id: userId,
      brand,
      display_name: nickname,
      nickname,
      model: model ?? null,
      year: year ?? null,
      data_source: "mock",
      is_active: true,
    })
    .select("id")
    .single();

  if (insertErr || !vehicle) {
    console.error("[vehicles/POST]", insertErr?.message ?? "no vehicle returned");
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }

  // Seed initial mock state
  const snapshot = createInitialSnapshot(vehicle.id, nickname, brand, scenario.id, model ?? null);
  await saveSnapshot(vehicle.id, null, snapshot);

  return NextResponse.json({ id: vehicle.id }, { status: 201 });
}
