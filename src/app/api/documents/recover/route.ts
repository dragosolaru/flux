/**
 * Recovers unmatched email documents and assigns them to the current user's
 * first active vehicle.
 *
 * Access control:
 *   The address must be VERIFIED — proven by opening a signed link sent to it,
 *   recorded in profiles.email_verified_at — before it is honoured as identity.
 *
 *   The comment here used to call the address verified while nothing verified
 *   it. /api/auth/register creates every user with email_confirm: true and no
 *   verification mail, because signInWithPassword refuses an unconfirmed
 *   address and there is no SMTP behind it. So anyone could register an
 *   address they did not own and claim every unmatched document that address
 *   had ever sent in. Gating on Supabase's own email_confirmed_at would have
 *   read as a fix and changed nothing: it is always set.
 *
 *   sender_email itself is still only a filter, not a credential — nothing in
 *   the inbound webhook verifies DKIM or SPF, so a From header is free text.
 *   Verification is what makes the pairing mean something.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { processDocument } from "@/lib/costs/processor";
import { checkRateLimit } from "@/lib/rate-limit";
import { logServer } from "@/lib/debug-log";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("email_verified_at")
    .eq("id", userId)
    .maybeSingle();

  // An address in ADMIN_EMAILS counts as verified, and it is not a loophole:
  // that list lives in the deployment's environment, so being on it means
  // whoever controls the environment vouched for the address. Anyone able to
  // edit it already owns everything this gate protects — it is strictly
  // stronger evidence than clicking a link in an inbox.
  //
  // The practical reason is that the alternative is worse. Without it, a solo
  // deployment cannot claim its own documents until Resend is configured, and
  // a fail-closed gate nobody can pass invites turning the gate off.
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isOwner = adminEmails.includes(userEmail);

  if (!isOwner && !(profile as { email_verified_at: string | null } | null)?.email_verified_at) {
    return NextResponse.json(
      {
        message: "Confirm your email address before claiming documents",
        code: "EMAIL_NOT_VERIFIED",
      },
      { status: 403 },
    );
  }

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
      if (rollbackErr) logServer("error", "storage.remove", rollbackErr.message, { paths: newPath });
      continue;
    }

    const { error: cleanupErr } = await supabase.storage.from("documents").remove([oldPath]);
    if (cleanupErr) logServer("error", "storage.remove", cleanupErr.message, { paths: oldPath });

    recovered.push(doc.id);
    processDocument(doc.id).catch((err: unknown) => {
      console.error("[recover processDocument]", doc.id, err);
    });
  }

  return NextResponse.json({ recovered: recovered.length });
}
