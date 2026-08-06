import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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
    console.error("[saved-routes/GET]", error.message);
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

  const { count } = await supabase
    .from("saved_routes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.user.id);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ message: "saved_routes_limit" }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("saved_routes")
    .insert({
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
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[saved-routes/POST]", error?.message ?? "Insert failed");
    return NextResponse.json({ message: "Failed to save route" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
