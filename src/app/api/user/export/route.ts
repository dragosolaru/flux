import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  if (!await checkRateLimit(userId, "data-export", 5)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, display_name, brand, model, vin, data_source, is_active, created_at, updated_at")
    .eq("user_id", userId);

  // charging_sessions, command_events, energy_costs have no user_id column —
  // ownership is established through vehicles.
  const vehicleIds = (vehicles ?? []).map((v: { id: string }) => v.id);

  const [
    { data: chargingSessions },
    { data: documents },
    { data: energyCosts },
    { data: userSettings },
    { data: profiles },
    { data: commandEvents },
  ] = await Promise.all([
    vehicleIds.length > 0
      ? supabase
          .from("charging_sessions")
          .select("id, vehicle_id, started_at, ended_at, energy_added_kwh, start_soc, end_soc, location_name, network, cost_eur, cost_ron")
          .in("vehicle_id", vehicleIds)
          .order("started_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("documents")
      .select("id, vehicle_id, source, document_type, original_filename, mime_type, status, confidence, parsed_json, error_message, created_at, processed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    vehicleIds.length > 0
      ? supabase
          .from("energy_costs")
          .select("id, vehicle_id, document_id, document_type, period_start, period_end, total_kwh, vehicle_kwh_attributed, original_amount, original_currency, cost_ron, provider_name, charger_network, location_name, created_at")
          .in("vehicle_id", vehicleIds)
          .order("period_start", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("user_settings")
      .select("tariff_provider, currency, locale, home_address, home_lat, home_lng")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, created_at")
      .eq("id", userId)
      .maybeSingle(),
    vehicleIds.length > 0
      ? supabase
          .from("command_events")
          .select("id, vehicle_id, command, success, error_code, source, issued_at")
          .in("vehicle_id", vehicleIds)
          .order("issued_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  // Replace storage_path raw values with a placeholder
  const sanitizedDocuments = (documents ?? []).map(
    (doc: Record<string, unknown>) => ({
      ...doc,
      storage_path: "[file]",
    }),
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: userId,
      email: session.user.email ?? null,
      name: session.user.name ?? profiles?.full_name ?? null,
    },
    profile: profiles ?? null,
    vehicles: vehicles ?? [],
    charging_sessions: chargingSessions ?? [],
    documents: sanitizedDocuments,
    energy_costs: energyCosts ?? [],
    command_events: commandEvents ?? [],
    settings: userSettings ?? null,
  };

  const json = JSON.stringify(payload, null, 2);

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="flux-data-export.json"',
    },
  });
}
