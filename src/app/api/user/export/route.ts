import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();

  const [
    { data: vehicles },
    { data: chargingSessions },
    { data: documents },
    { data: energyCosts },
    { data: userSettings },
    { data: profiles },
    { data: commandEvents },
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, display_name, brand, model, vin, data_source, is_active, created_at, updated_at")
      .eq("user_id", userId),
    supabase
      .from("charging_sessions")
      .select("id, vehicle_id, started_at, ended_at, energy_added_kwh, start_battery_level, end_battery_level, location_name, charger_type, created_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, vehicle_id, source, document_type, original_filename, mime_type, status, confidence, parsed_json, error_message, created_at, processed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("energy_costs")
      .select("id, vehicle_id, document_id, document_type, period_start, period_end, total_kwh, vehicle_kwh_attributed, original_amount, original_currency, cost_ron, provider_name, charger_network, location_name, created_at")
      .eq("user_id", userId)
      .order("period_start", { ascending: false }),
    supabase
      .from("user_settings")
      .select("tariff_provider, currency, locale, home_address, home_lat, home_lng")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("command_events")
      .select("id, vehicle_id, command, status, error_message, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
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
      email: session.user.email ?? profiles?.email ?? null,
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
