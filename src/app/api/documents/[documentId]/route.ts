import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { checkRateLimit } from "@/lib/rate-limit";

const uuidSchema = z.string().uuid();

const PatchSchema = z.object({
  cost_ron: z.number().positive().optional(),
  total_kwh: z.number().positive().optional(),
  vehicle_kwh_attributed: z.number().positive().optional(),
  provider_name: z.string().max(200).optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  if (!uuidSchema.safeParse(documentId).success) {
    return NextResponse.json({ message: "Invalid documentId" }, { status: 400 });
  }
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  const supabase = createSupabaseAdminClient();

  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (error || !doc) return NextResponse.json({ message: "Not found" }, { status: 404 });

  return NextResponse.json(doc);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  if (!uuidSchema.safeParse(documentId).success) {
    return NextResponse.json({ message: "Invalid documentId" }, { status: 400 });
  }
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  if (!await checkRateLimit(userId, "doc-patch", 30)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await request.json() as unknown;
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.message }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, vehicle_id, parsed_json")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (!doc) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = { is_manually_edited: true };
  if (parsed.data.cost_ron !== undefined) updates.cost_ron = parsed.data.cost_ron;
  if (parsed.data.total_kwh !== undefined) updates.total_kwh = parsed.data.total_kwh;
  if (parsed.data.vehicle_kwh_attributed !== undefined) updates.vehicle_kwh_attributed = parsed.data.vehicle_kwh_attributed;
  if (parsed.data.provider_name !== undefined) updates.provider_name = parsed.data.provider_name;
  if (parsed.data.period_start !== undefined) updates.period_start = parsed.data.period_start;
  if (parsed.data.period_end !== undefined) updates.period_end = parsed.data.period_end;

  // Check if an energy_cost record already exists for this document
  const { data: existing } = await supabase
    .from("energy_costs")
    .select("id")
    .eq("document_id", documentId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("energy_costs")
      .update(updates)
      .eq("document_id", documentId);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  } else if ((doc as { vehicle_id: string | null }).vehicle_id && (parsed.data.cost_ron || parsed.data.total_kwh)) {
    // Non-electricity doc manually confirmed — create energy_cost record.
    // Re-verify vehicle ownership even though document is already scoped to userId,
    // to ensure the vehicle_id FK is still valid and belongs to this user.
    const today = new Date().toISOString().slice(0, 10);
    const pj = (doc as { parsed_json: Record<string, unknown> | null }).parsed_json;
    const vehicleId = (doc as { vehicle_id: string }).vehicle_id;
    const { data: ownedVehicle } = await supabase
      .from("vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("user_id", userId)
      .single();
    if (!ownedVehicle) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    await supabase.from("energy_costs").insert({
      document_id: documentId,
      vehicle_id: vehicleId,
      document_type: "home_bill",
      period_start: parsed.data.period_start ?? (pj?.period_start as string | null) ?? today,
      period_end: parsed.data.period_end ?? (pj?.period_end as string | null) ?? today,
      total_kwh: parsed.data.total_kwh ?? null,
      vehicle_kwh_attributed: parsed.data.total_kwh ?? null,
      original_amount: parsed.data.cost_ron ?? 0,
      original_currency: "RON",
      exchange_rate: 1,
      cost_ron: parsed.data.cost_ron ?? 0,
      is_manually_edited: true,
    });
  }

  await supabase
    .from("documents")
    .update({ status: "done" })
    .eq("id", documentId);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  if (!uuidSchema.safeParse(documentId).success) {
    return NextResponse.json({ message: "Invalid documentId" }, { status: 400 });
  }
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  if (!await checkRateLimit(userId, "doc-delete", 20)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (!doc) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const storagePath = (doc as { storage_path: string | null }).storage_path;
  if (storagePath) {
    await supabase.storage.from("documents").remove([storagePath]);
  }

  // Delete document — energy_costs cascade via FK (on delete cascade)
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
