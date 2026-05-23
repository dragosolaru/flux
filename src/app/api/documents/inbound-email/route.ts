/**
 * Inbound email webhook — compatible with:
 *   - Cloudmailin (JSON body or multipart)
 *   - Mailgun (multipart/form-data)
 *   - SendGrid Inbound Parse (multipart/form-data)
 *
 * Vehicle identification (in order of precedence):
 *   1. To address sub-address: local+slug-shortid@domain
 *   2. Subject line contains vehicle nickname (case-insensitive)
 *   3. Sender email matches a registered user's email → their first active vehicle
 *
 * Env vars needed:
 *   EMAIL_WEBHOOK_SECRET            — shared secret (?secret= query param)
 *   NEXT_PUBLIC_CLOUDMAILIN_ADDRESS — e.g. 2b31b9c101b11f6682f3@cloudmailin.net
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processDocument } from "@/lib/costs/processor";
import { isSupportedMimeType } from "@/lib/ai/prompts/document-extraction";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID_RE = /[a-f0-9]{8}$/i;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

interface EmailAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

interface ParsedEmail {
  to: string;
  from: string;
  subject: string;
  attachments: EmailAttachment[];
}

function extractVehicleIdFromAddress(toHeader: string): { type: "uuid"; id: string } | { type: "shortId"; id: string } | null {
  const match = toHeader.match(/\+([^@+\s]+)@/i);
  if (!match) return null;
  const candidate = match[1];
  if (UUID_RE.test(candidate)) return { type: "uuid", id: candidate };
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

async function findVehicleBySenderEmail(
  fromEmail: string,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<{ id: string; user_id: string } | null> {
  if (!fromEmail) return null;

  const email = fromEmail.replace(/.*<(.+)>/, "$1").trim().toLowerCase();

  // Find the Supabase auth user with this email
  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUser = authList?.users.find(
    (u: { email?: string }) => u.email?.toLowerCase() === email,
  );
  if (!authUser) return null;

  // Get their active vehicles (prefer one vehicle → unambiguous)
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, user_id")
    .eq("user_id", authUser.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(2);

  if (!vehicles || vehicles.length === 0) return null;

  // If they have exactly one vehicle, use it; if multiple, can't determine which
  if (vehicles.length === 1) {
    return { id: (vehicles[0] as { id: string; user_id: string }).id, user_id: authUser.id };
  }

  // Multiple vehicles — caller should use subaddress; return first as best guess
  return { id: (vehicles[0] as { id: string; user_id: string }).id, user_id: authUser.id };
}

interface CloudmailinBody {
  headers?: Record<string, string>;
  envelope?: { to?: string; from?: string };
  plain?: string;
  attachments?: Array<{
    file_name?: string;
    content_type?: string;
    size?: number;
    content?: string;
    disposition?: string;
  }>;
}

async function parseCloudmailinEmail(request: Request): Promise<ParsedEmail> {
  const body = await request.json() as CloudmailinBody;
  const headers = body.headers ?? {};

  const to = headers.To ?? headers.to ?? body.envelope?.to ?? "";
  const from = headers.From ?? headers.from ?? body.envelope?.from ?? "";
  const subject = headers.Subject ?? headers.subject ?? "";

  const attachments: EmailAttachment[] = [];
  for (const att of body.attachments ?? []) {
    if (!att.content) continue;
    const mimeType = att.content_type ?? "application/octet-stream";
    if (!isSupportedMimeType(mimeType)) continue;
    const buffer = Buffer.from(att.content, "base64");
    if (buffer.length > MAX_ATTACHMENT_BYTES) continue;
    attachments.push({ filename: att.file_name ?? "attachment", mimeType, buffer });
  }

  return { to, from, subject, attachments };
}

async function parseMultipartEmail(request: Request): Promise<ParsedEmail> {
  const formData = await request.formData();

  const to = (formData.get("To") as string | null) ?? (formData.get("to") as string | null) ?? "";
  const from = (formData.get("From") as string | null) ?? (formData.get("from") as string | null) ?? "";
  const subject = (formData.get("Subject") as string | null) ?? (formData.get("subject") as string | null) ?? "";

  const attachments: EmailAttachment[] = [];
  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    if (!key.startsWith("attachment") && key !== "file") continue;
    const mimeType = value.type || "application/octet-stream";
    if (!isSupportedMimeType(mimeType)) continue;
    if (value.size > MAX_ATTACHMENT_BYTES) continue;
    const buffer = Buffer.from(await value.arrayBuffer());
    attachments.push({ filename: value.name, mimeType, buffer });
  }

  return { to, from, subject, attachments };
}

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (secret) {
    const headerSecret = request.headers.get("x-webhook-secret")
      ?? new URL(request.url).searchParams.get("secret");
    if (headerSecret !== secret) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  let parsed: ParsedEmail;
  try {
    const ct = request.headers.get("content-type") ?? "";
    parsed = ct.includes("application/json")
      ? await parseCloudmailinEmail(request)
      : await parseMultipartEmail(request);
  } catch {
    return NextResponse.json({ message: "Failed to parse email" }, { status: 400 });
  }

  if (parsed.attachments.length === 0) {
    return NextResponse.json({ message: "No supported attachments found" }, { status: 200 });
  }

  const supabase = createSupabaseAdminClient();

  let vehicleId: string | null = null;
  let userId: string | null = null;

  // 1. Vehicle ID from To address subaddress
  const addressResult = extractVehicleIdFromAddress(parsed.to);
  if (addressResult) {
    const query = addressResult.type === "uuid"
      ? supabase.from("vehicles").select("id, user_id").eq("id", addressResult.id).eq("is_active", true).single()
      : supabase.from("vehicles").select("id, user_id").ilike("id", `${addressResult.id}%`).eq("is_active", true).single();
    const { data: v } = await query;
    if (v) {
      vehicleId = (v as { id: string; user_id: string }).id;
      userId = (v as { id: string; user_id: string }).user_id;
    }
  }

  // 2. Vehicle nickname in subject
  if (!vehicleId) {
    const found = await findVehicleByNickname(parsed.subject, supabase);
    if (found) { vehicleId = found.id; userId = found.user_id; }
  }

  // 3. Sender email → registered user → their vehicle
  if (!vehicleId && parsed.from) {
    const found = await findVehicleBySenderEmail(parsed.from, supabase);
    if (found) { vehicleId = found.id; userId = found.user_id; }
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
      .upload(storagePath, attachment.buffer, { contentType: attachment.mimeType, upsert: false });

    if (uploadErr) { skipped.push(attachment.filename); continue; }

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

    if (insertErr || !doc) { skipped.push(attachment.filename); continue; }

    createdIds.push((doc as { id: string }).id);

    if (vehicleId) {
      processDocument((doc as { id: string }).id).catch((err: unknown) => {
        console.error("[inbound-email processDocument]", (doc as { id: string }).id, err);
      });
    }
  }

  return NextResponse.json({ created: createdIds, skipped }, { status: 200 });
}
