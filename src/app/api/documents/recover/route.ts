/**
 * Recovers unmatched email documents and assigns them to the current user's
 * first active vehicle. Used when an email arrived before the user had an
 * account, or when the From/To fields didn't allow automatic matching.
 *
 * Security note: this assigns ANY unmatched document to the caller. Acceptable
 * for the current single-tenant pilot; tighten before opening to multiple users
 * (e.g. require a per-user claim token printed inside the email body).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { processDocument } from "@/lib/costs/processor";

const UNMATCHED_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

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

  const { data: docs } = await supabase
    .from("documents")
    .select("id, storage_path, mime_type, original_filename")
    .eq("user_id", UNMATCHED_USER_ID)
    .is("vehicle_id", null);

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

    await supabase.storage.from("documents").remove([oldPath]);

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

    if (updateErr) continue;

    recovered.push(doc.id);
    processDocument(doc.id).catch((err: unknown) => {
      console.error("[recover processDocument]", doc.id, err);
    });
  }

  return NextResponse.json({ recovered: recovered.length, vehicleId });
}
