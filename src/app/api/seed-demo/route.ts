// =============================================================================
// Demo seed endpoint — populates the current user's account with 3 mock vehicles
// (Tesla Model 3, BMW i4, Polestar 2) covering a range of brand capabilities.
//
// Idempotent: skips any vehicle with a matching nickname already on the account.
// =============================================================================

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createInitialSnapshot } from "@/lib/mock/seed";
import type { BrandKey } from "@/lib/brands/types";

interface DemoVehicleSeed {
  brand: BrandKey;
  model: string;
  year: number;
  nickname: string;
  displayName: string;
  scenarioId: string;
}

const DEMO_VEHICLES: DemoVehicleSeed[] = [
  {
    brand: "tesla",
    model: "Model 3",
    year: 2024,
    nickname: "Black Panther",
    displayName: "Tesla Model 3",
    scenarioId: "commuter",
  },
  {
    brand: "bmw",
    model: "i4 eDrive35",
    year: 2025,
    nickname: "Storm",
    displayName: "BMW i4",
    scenarioId: "weekend-errands",
  },
  {
    brand: "polestar",
    model: "Polestar 2",
    year: 2024,
    nickname: "Aurora",
    displayName: "Polestar 2",
    scenarioId: "road-trip",
  },
];

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  // Find existing nicknames to skip
  const { data: existing } = await supabase
    .from("vehicles")
    .select("nickname")
    .eq("user_id", session.user.id)
    .eq("is_active", true);

  const existingNicknames = new Set((existing ?? []).map((v) => v.nickname));
  const created: string[] = [];
  const skipped: string[] = [];

  for (const seed of DEMO_VEHICLES) {
    if (existingNicknames.has(seed.nickname)) {
      skipped.push(seed.nickname);
      continue;
    }

    const { data: row, error } = await supabase
      .from("vehicles")
      .insert({
        user_id: session.user.id,
        brand: seed.brand,
        model: seed.model,
        year: seed.year,
        nickname: seed.nickname,
        display_name: seed.displayName,
        data_source: "mock",
        is_active: true,
      })
      .select("id")
      .single();

    if (error || !row) {
      return NextResponse.json(
        { message: "Failed to insert vehicle", error: error?.message, nickname: seed.nickname },
        { status: 500 },
      );
    }

    const snapshot = createInitialSnapshot(
      row.id,
      seed.displayName,
      seed.brand,
      seed.scenarioId,
      seed.model,
    );

    await supabase.from("mock_vehicle_state").upsert({
      vehicle_id: row.id,
      state: snapshot.state,
      motion_state: snapshot.motionState,
      scenario_id: snapshot.scenarioId,
      last_tick_at: snapshot.lastTickAt,
      vehicle_spec: snapshot.vehicleSpec,
      active_charging_session_start: null,
      active_charging_session_network: null,
      active_charging_session_start_soc: null,
      active_trip_start: null,
      active_trip_start_lat: null,
      active_trip_start_lng: null,
      active_trip_start_odometer_km: null,
    });

    created.push(seed.nickname);
  }

  return NextResponse.json({
    created,
    skipped,
    total: created.length + skipped.length,
  });
}
