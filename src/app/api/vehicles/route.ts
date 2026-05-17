import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brands/registry";
import { createInitialSnapshot } from "@/lib/mock/seed";
import { saveSnapshot } from "@/lib/mock/persistence";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listScenarios } from "@/lib/mock/scenarios";

// GET /api/vehicles — list all active vehicles for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, brand, display_name, nickname, model, year, data_source")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json(
    (data ?? []).map((v) => ({
      id: v.id,
      brand: v.brand,
      displayName: v.display_name,
      nickname: v.nickname ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      dataSource: v.data_source,
    })),
  );
}

const addVehicleSchema = z.object({
  brand: z.enum(["tesla", "bmw", "polestar", "mercedes", "vw", "hyundai", "renault"]),
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

  const { data: vehicle, error: insertErr } = await supabase
    .from("vehicles")
    .insert({
      user_id: session.user.id,
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
    return NextResponse.json(
      { message: insertErr?.message ?? "Failed to create vehicle" },
      { status: 500 },
    );
  }

  // Seed initial mock state
  const snapshot = createInitialSnapshot(vehicle.id, nickname, brand, scenario.id);
  await saveSnapshot(vehicle.id, null, snapshot);

  return NextResponse.json({ id: vehicle.id }, { status: 201 });
}
