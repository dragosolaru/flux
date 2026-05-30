/**
 * Recovers unmatched email documents and assigns them to the current user's
 * first active vehicle.
 *
 * Access control:
 *   Only documents whose stored sender_email matches the authenticated user's
 *   verified email are eligible. Other unmatched documents stay in the
 *   unmatched/ pool — they belong to someone else.
 *
 *   This prevents user B from claiming user A's documents when the inbound
 *   webhook can't auto-resolve a vehicle from the To header.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { processDocument } from "@/lib/costs/processor";
import { checkRateLimit } from "@/lib/rate-limit";

const UNMATCHED_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userEmail = session.user.email.toLowerCase();

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  if (!await checkRateLimit(userId, "doc-recover", 10)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!vehicle) return NextResponse.json({ message: "No active vehicle" }, { status: 400 });

  const vehicleId = (vehicle as { id: string }).id;

  // Only claim docs whose sender_email matches the current user's verified email.
  const { data: docs } = await supabase
    .from("documents")
    .select("id, storage_path, mime_type, original_filename")
    .eq("user_id", UNMATCHED_USER_ID)
    .is("vehicle_id", null)
    .eq("sender_email", userEmail);

  if (!docs || docs.length === 0) {
    return NextResponse.json({ recovered: 0 });
  }

  const recovered: string[] = [];

  for (const doc of docs as { id: string; storage_path: string; mime_type: string; original_filename: string | null }[]) {
    const oldPath = doc.storage_path;
    const ext = oldPath.split(".").pop() ?? "bin";
    const newPath = `${userId}/${vehicleId}/${crypto.randomUUID()}.${ext}`;

    const { data: file } = await supabase.storage.from("documents").download(oldPath);
    if (!file) continue;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(newPath, buffer, { contentType: doc.mime_type, upsert: false });
    if (uploadErr) continue;

    // DB update BEFORE removing the old file — if update fails we still have
    // the original blob and can retry. Avoids orphan storage on partial failure.
    const { error: updateErr } = await supabase
      .from("documents")
      .update({
        user_id: userId,
        vehicle_id: vehicleId,
        storage_path: newPath,
        status: "pending",
        error_message: null,
      })
      .eq("id", doc.id);

    if (updateErr) {
      // Roll back the new file so we don't leak storage.
      const { error: rollbackErr } = await supabase.storage.from("documents").remove([newPath]);
      if (rollbackErr) console.error("[storage.remove]", newPath, rollbackErr.message);
      continue;
    }

    const { error: cleanupErr } = await supabase.storage.from("documents").remove([oldPath]);
    if (cleanupErr) console.error("[storage.remove]", oldPath, cleanupErr.message);

    recovered.push(doc.id);
    processDocument(doc.id).catch((err: unknown) => {
      console.error("[recover processDocument]", doc.id, err);
    });
  }

  return NextResponse.json({ recovered: recovered.length });
}
