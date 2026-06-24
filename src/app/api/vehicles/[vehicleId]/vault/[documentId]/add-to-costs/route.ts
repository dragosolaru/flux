import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createEnergyCostRecord } from "@/lib/costs/processor";
import type { ParsedDocument } from "@/types/costs";

// Promote an energy receipt (home_bill / public_receipt) that was uploaded to the
// per-vehicle document vault into the cost dashboard. Energy receipts uploaded to the
// vault are parked (status "needs_review") instead of being added to costs silently;
// this endpoint creates the energy_cost record only when the user explicitly confirms.
export async function POST(
  _req: Request,
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

  const supabase = createSupabaseAdminClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, parsed_json")
    .eq("id", documentId)
    .eq("vehicle_id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  const parsed = doc.parsed_json as ParsedDocument | null;
  if (!parsed || (parsed.document_type !== "home_bill" && parsed.document_type !== "public_receipt")) {
    return NextResponse.json({ message: "Not an energy document" }, { status: 400 });
  }

  // Guard against double-add: only promote receipts not yet linked to a cost.
  const { data: existing } = await supabase
    .from("energy_costs")
    .select("id")
    .eq("document_id", documentId)
    .maybeSingle();

  if (!existing) {
    await createEnergyCostRecord(documentId, vehicleId, parsed);
  }

  // Move it out of the vault view (no longer a vault-upload) and mark it done.
  await supabase
    .from("documents")
    .update({ source: "upload", status: "done" })
    .eq("id", documentId);

  return NextResponse.json({ ok: true });
}
