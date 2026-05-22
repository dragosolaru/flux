/**
 * Inbound email webhook — compatible with Mailgun, SendGrid Inbound Parse,
 * and any service that POSTs multipart/form-data with the fields below.
 *
 * Setup (choose one):
 *
 * A) Mailgun — go to Receiving → Create Route → Forward to:
 *    https://your-app.vercel.app/api/documents/inbound-email
 *    Set EMAIL_WEBHOOK_SECRET to your Mailgun webhook signing key.
 *
 * B) SendGrid Inbound Parse — Settings → Inbound Parse → Add Host & URL:
 *    https://your-app.vercel.app/api/documents/inbound-email
 *    Set EMAIL_WEBHOOK_SECRET to any random string and add it as a header check.
 *
 * Vehicle identification (in order of precedence):
 *   1. To address: flux+<vehicleId>@yourdomain.com  (UUID in + part)
 *   2. Subject line contains vehicle nickname (case-insensitive)
 *
 * Env vars needed:
 *   EMAIL_WEBHOOK_SECRET — shared secret to verify webhook authenticity
 *   NEXT_PUBLIC_APP_URL  — your app URL (e.g. https://flux.vercel.app)
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processDocument } from "@/lib/costs/processor";
import { isSupportedMimeType } from "@/lib/ai/prompts/document-extraction";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID_RE = /[a-f0-9]{8}$/i; // last 8 hex chars of slug-shortid format
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

interface EmailAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

function extractVehicleIdFromAddress(toHeader: string): { type: "uuid"; id: string } | { type: "shortId"; id: string } | null {
  const match = toHeader.match(/flux\+([^@\s]+)@/i);
  if (!match) return null;
  const candidate = match[1];
  // Format 1: full UUID (e.g. flux+f793064e-b685-475e-a557-efb3f1ab18ee@)
  if (UUID_RE.test(candidate)) return { type: "uuid", id: candidate };
  // Format 2: slug-shortid (e.g. flux+black-panther-f793064e@)
  const shortMatch = candidate.match(SHORT_ID_RE);
  if (shortMatch) return { type: "shortId", id: shortMatch[0].toLowerCase() };
  return null;
}

async function findVehicleByNickname(
  subject: string,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<{ id: string; user_id: string } | null> {
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, user_id, nickname")
    .eq("is_active", true);

  if (!vehicles) return null;

  const lowerSubject = subject.toLowerCase();
  for (const v of vehicles as { id: string; user_id: string; nickname: string | null }[]) {
    if (v.nickname && lowerSubject.includes(v.nickname.toLowerCase())) {
      return { id: v.id, user_id: v.user_id };
    }
  }
  return null;
}

async function parseMultipartEmail(request: Request): Promise<{
  to: string;
  subject: string;
  attachments: EmailAttachment[];
}> {
  const formData = await request.formData();

  const to = (formData.get("To") as string | null)
    ?? (formData.get("to") as string | null)
    ?? "";
  const subject = (formData.get("Subject") as string | null)
    ?? (formData.get("subject") as string | null)
    ?? "";

  const attachments: EmailAttachment[] = [];

  // Mailgun sends attachments as attachment-1, attachment-2, ...
  // SendGrid sends them as attachments (JSON array of filenames) + file fields
  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    if (!key.startsWith("attachment") && key !== "file") continue;

    const mimeType = value.type || "application/octet-stream";
    if (!isSupportedMimeType(mimeType)) continue;
    if (value.size > MAX_ATTACHMENT_BYTES) continue;

    const buffer = Buffer.from(await value.arrayBuffer());
    attachments.push({ filename: value.name, mimeType, buffer });
  }

  return { to, subject, attachments };
}

export async function POST(request: Request) {
  // Simple shared-secret auth — check header or query param
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (secret) {
    const headerSecret = request.headers.get("x-webhook-secret")
      ?? new URL(request.url).searchParams.get("secret");
    if (headerSecret !== secret) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  let parsed: { to: string; subject: string; attachments: EmailAttachment[] };
  try {
    parsed = await parseMultipartEmail(request);
  } catch {
    return NextResponse.json({ message: "Failed to parse email" }, { status: 400 });
  }

  if (parsed.attachments.length === 0) {
    return NextResponse.json({ message: "No supported attachments found" }, { status: 200 });
  }

  const supabase = createSupabaseAdminClient();

  // Identify vehicle
  const addressResult = extractVehicleIdFromAddress(parsed.to);
  let vehicleId: string | null = null;
  let userId: string | null = null;

  if (addressResult) {
    let query;
    if (addressResult.type === "uuid") {
      query = supabase.from("vehicles").select("id, user_id").eq("id", addressResult.id).eq("is_active", true).single();
    } else {
      // shortId: first 8 hex chars of UUID (no dashes) → match against id::text
      query = supabase.from("vehicles").select("id, user_id").ilike("id", `${addressResult.id}%`).eq("is_active", true).single();
    }
    const { data: v } = await query;
    if (v) {
      vehicleId = (v as { id: string; user_id: string }).id;
      userId = (v as { id: string; user_id: string }).user_id;
    }
  }

  if (!vehicleId) {
    const found = await findVehicleByNickname(parsed.subject, supabase);
    if (found) {
      vehicleId = found.id;
      userId = found.user_id;
    }
  }

  const createdIds: string[] = [];
  const skipped: string[] = [];

  for (const attachment of parsed.attachments) {
    const ext = attachment.filename.split(".").pop() ?? "bin";
    const storagePath = vehicleId && userId
      ? `${userId}/${vehicleId}/${crypto.randomUUID()}.${ext}`
      : `unmatched/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, attachment.buffer, {
        contentType: attachment.mimeType,
        upsert: false,
      });

    if (uploadErr) {
      skipped.push(attachment.filename);
      continue;
    }

    const { data: doc, error: insertErr } = await supabase
      .from("documents")
      .insert({
        user_id: userId ?? "00000000-0000-0000-0000-000000000000",
        vehicle_id: vehicleId,
        source: "email",
        storage_path: storagePath,
        mime_type: attachment.mimeType,
        original_filename: attachment.filename,
        status: vehicleId ? "pending" : "needs_review",
      })
      .select("id")
      .single();

    if (insertErr || !doc) {
      skipped.push(attachment.filename);
      continue;
    }

    createdIds.push((doc as { id: string }).id);

    if (vehicleId) {
      processDocument((doc as { id: string }).id).catch((err: unknown) => {
        console.error("[inbound-email processDocument]", (doc as { id: string }).id, err);
      });
    }
  }

  return NextResponse.json({ created: createdIds, skipped }, { status: 200 });
}
