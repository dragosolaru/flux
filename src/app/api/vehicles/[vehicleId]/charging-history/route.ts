import { NextResponse } from "next/server";

import { errorContext, recordDebugLog } from "@/lib/debug-log";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isLiveEnabled } from "@/lib/live-integrations";
import { fetchTeslaChargingHistory } from "@/lib/tesla/charging-history";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(
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

  if (!(await checkRateLimit(session.user.id, "charging-history", 20))) {
    return NextResponse.json(
      { message: "Too many requests" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: vehicle, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, brand, data_source, tesla_vehicle_id, user_id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (vehErr || !vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  if (!isLiveEnabled(vehicle.brand) || vehicle.data_source !== "live") {
    return NextResponse.json({ message: "Only available for live vehicles" }, { status: 400 });
  }

  if (vehicle.brand !== "tesla" || !vehicle.tesla_vehicle_id) {
    return NextResponse.json({ message: "Tesla vehicle required" }, { status: 400 });
  }

  try {
    const sessions = await fetchTeslaChargingHistory({
      vehicleId: vehicle.id,
      userId: session.user.id,
      teslaVehicleId: vehicle.tesla_vehicle_id,
    });

    // Upsert into charging_sessions (only columns that exist in the schema)
    let inserted = 0;
    for (const s of sessions) {
      const startedAt = new Date(s.chargeStartDateTime).toISOString();
      const endedAt = new Date(s.chargeStopDateTime).toISOString();

      const { error } = await supabase
        .from("charging_sessions")
        .upsert(
          {
            vehicle_id: vehicle.id,
            started_at: startedAt,
            ended_at: endedAt,
            energy_added_kwh: s.chargeEnergyAddedKwh,
            location_name: s.siteLocationName ?? null,
            cost_eur: s.fees?.currencyCode === "EUR" ? s.fees.totalDue : null,
          },
          {
            onConflict: "vehicle_id,started_at",
            ignoreDuplicates: true,
          },
        );
      if (!error) inserted++;
    }

    return NextResponse.json({ synced: inserted, total: sessions.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    // fetchTeslaChargingHistory throws `Tesla charging history <status>: <body>`,
    // and that status is the whole diagnosis — 401 is a token problem, 403 a
    // missing scope, 404 a wrong path, 4xx on the query a bad page parameter.
    // Collapsing all of it into "Sync failed" left the one useful fact in a log
    // nobody reads from a phone.
    // Scope names are read as route paths in the debug panel, so they have to
    // match one. This said "tesla/charging-history", which is not a route —
    // /api/tesla/charging-history 404s — and was duly typed into the API caller.
    recordDebugLog("error", "vehicles/charging-history", msg, errorContext(err));
    const status = /history (\d{3}):/.exec(msg)?.[1] ?? null;
    // Tesla's charging endpoints are restricted to business fleet accounts. On
    // a personal account this call can never succeed, so "try again" is advice
    // that wastes the driver's time forever. Say it is unavailable instead —
    // the real charging history has to come from Fleet Telemetry, which is
    // tracked in docs/TESLA-API-CAPABILITIES.md.
    if (status === "403") {
      return NextResponse.json(
        {
          message: "Sync failed",
          code: "CHARGING_HISTORY_UNAVAILABLE",
          upstreamStatus: 403,
          detail: msg.slice(0, 300),
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        message: "Sync failed",
        upstreamStatus: status ? Number(status) : null,
        detail: msg.slice(0, 300),
      },
      { status: 502 },
    );
  }
}

/**
 * The stored sessions for ONE vehicle.
 *
 * Added because `/charging` had no way to ask for them per car: the page
 * fetched history server-side for the FIRST vehicle by `created_at`, while the
 * client rendered live state for the SELECTED one. With two cars linked, the
 * sessions on screen belonged to a different car than the battery above them,
 * and nothing said so.
 */
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

  // Ownership first: charging_sessions has no user_id of its own, so the only
  // thing standing between a session row and another account is this check.
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
    .from("charging_sessions")
    .select(
      "id, started_at, ended_at, energy_added_kwh, start_soc, end_soc, network, cost_eur, cost_ron, max_charging_rate_kw, location_name",
    )
    .eq("vehicle_id", vehicleId)
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    recordDebugLog("error", "vehicles/charging-history", error.message);
    return NextResponse.json({ message: "Query failed" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
