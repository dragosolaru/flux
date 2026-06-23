import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const PatchSchema = z.object({
  amount_ron: z.number().positive().nullable().optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  issuer: z.string().max(200).nullable().optional(),
  plate_number: z.string().max(20).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ vehicleId: string; documentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId, documentId } = await params;

  if (!z.string().uuid().safeParse(vehicleId).success || !z.string().uuid().safeParse(documentId).success) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "vault-write", 60))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body", errors: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createSupabaseAdminClient();

  // Verify ownership: document must belong to this vehicle and user
  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("vehicle_id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  // Build only the fields that were provided
  const updates: Record<string, unknown> = {};
  if (parsed.data.amount_ron !== undefined) updates.amount_ron = parsed.data.amount_ron;
  if (parsed.data.valid_until !== undefined) updates.valid_until = parsed.data.valid_until;
  if (parsed.data.valid_from !== undefined) updates.valid_from = parsed.data.valid_from;
  if (parsed.data.issuer !== undefined) updates.issuer = parsed.data.issuer;
  if (parsed.data.plate_number !== undefined) updates.plate_number = parsed.data.plate_number;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: "No fields to update" }, { status: 400 });
  }

  // Upsert into vehicle_doc_meta (may not exist yet for OCR-processed docs)
  const { error } = await supabase
    .from("vehicle_doc_meta")
    .upsert(
      { document_id: documentId, vehicle_id: vehicleId, ...updates },
      { onConflict: "document_id" },
    );

  if (error) {
    console.error("[vault/PATCH]", error.message);
    return NextResponse.json({ message: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
