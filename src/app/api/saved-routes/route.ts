import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { logServer } from "@/lib/debug-log";

// Serialized payload cap — stops/plan_snapshot are free-form JSONB; without a
// cap a client could persist multi-MB blobs replayed on every GET.
const MAX_BODY_BYTES = 100_000;

const SavedRouteSchema = z.object({
  name: z.string().min(1).max(100),
  origin_label: z.string().min(1).max(300),
  origin_lat: z.number().min(-90).max(90),
  origin_lng: z.number().min(-180).max(180),
  destination_label: z.string().min(1).max(300),
  destination_lat: z.number().min(-90).max(90),
  destination_lng: z.number().min(-180).max(180),
  stops: z.unknown(),
  plan_snapshot: z.unknown(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("saved_routes")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logServer("error", "saved-routes/GET", error.message);
    return NextResponse.json({ message: "Failed to fetch saved routes" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!(await checkRateLimit(session.user.id, "saved-routes-write", 30))) {
    return NextResponse.json(
      { message: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ message: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SavedRouteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body", errors: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createSupabaseAdminClient();

  // Saving a route the driver already has refreshes it instead of adding a row
  // — re-saving is what happens after re-planning the same trip, and the newer
  // plan is the one worth keeping. Migration 040 makes (user_id, route_key)
  // unique, so this is also what stops a double tap from inserting twice: the
  // second write resolves to the same key and updates.
  //
  // The key is computed by the database function that defines the generated
  // column rather than being recomputed here, so the two cannot drift apart
  // about what "the same route" means.
  const { data: routeKey, error: keyError } = await supabase.rpc("saved_route_key", {
    p_origin_lat: parsed.data.origin_lat,
    p_origin_lng: parsed.data.origin_lng,
    p_destination_lat: parsed.data.destination_lat,
    p_destination_lng: parsed.data.destination_lng,
  });

  if (keyError || typeof routeKey !== "string") {
    logServer("error", "saved-routes/POST:key", keyError?.message ?? "No key");
    return NextResponse.json({ message: "Failed to save route" }, { status: 500 });
  }

  // One read serves both checks: the cap counts the rows, and finding this key
  // among them means the save is a refresh. A refresh must stay possible for a
  // driver already holding ten routes, so only a new key is capped. Bounded by
  // the cap itself, so this stays a ten-row read.
  const { data: mine, error: listError } = await supabase
    .from("saved_routes")
    .select("route_key")
    .eq("user_id", session.user.id);

  if (listError) {
    logServer("error", "saved-routes/POST:list", listError.message);
    return NextResponse.json({ message: "Failed to save route" }, { status: 500 });
  }

  const isRefresh = (mine ?? []).some((r) => r.route_key === routeKey);
  if (!isRefresh && (mine?.length ?? 0) >= 10) {
    return NextResponse.json({ message: "saved_routes_limit" }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("saved_routes")
    .upsert(
      {
        user_id: session.user.id,
        name: parsed.data.name,
        origin_label: parsed.data.origin_label,
        origin_lat: parsed.data.origin_lat,
        origin_lng: parsed.data.origin_lng,
        destination_label: parsed.data.destination_label,
        destination_lat: parsed.data.destination_lat,
        destination_lng: parsed.data.destination_lng,
        stops: parsed.data.stops,
        plan_snapshot: parsed.data.plan_snapshot,
      },
      { onConflict: "user_id,route_key" },
    )
    .select()
    .single();

  if (error || !data) {
    logServer("error", "saved-routes/POST", error?.message ?? "Upsert failed");
    return NextResponse.json({ message: "Failed to save route" }, { status: 500 });
  }

  return NextResponse.json(data, { status: isRefresh ? 200 : 201 });
}
