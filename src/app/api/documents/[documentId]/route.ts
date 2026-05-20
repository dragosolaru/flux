import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";

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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  const body = await request.json() as unknown;
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.message }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id")
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

  const { error } = await supabase
    .from("energy_costs")
    .update(updates)
    .eq("document_id", documentId);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  await supabase
    .from("documents")
    .update({ status: "done" })
    .eq("id", documentId);

  return NextResponse.json({ ok: true });
}
