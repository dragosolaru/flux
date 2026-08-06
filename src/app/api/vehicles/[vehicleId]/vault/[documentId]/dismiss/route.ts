import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Dismiss an energy receipt that was parked in the vault (status "needs_review", source
// "vault-upload"). Changes the source to "upload" so the doc no longer appears in the
// vault energy-prompt section, without creating a cost record or deleting the file.
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
    .select("id")
    .eq("id", documentId)
    .eq("vehicle_id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  const { error } = await supabase
    .from("documents")
    .update({ source: "upload" })
    .eq("id", documentId)
    .eq("vehicle_id", vehicleId)
    .eq("user_id", session.user.id);

  if (error) {
    console.error("[vault/dismiss]", error.message);
    return NextResponse.json({ message: "Failed to dismiss" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
