/**
 * Inbound email webhook — compatible with:
 *   - Cloudmailin (JSON body or multipart)
 *   - Mailgun (multipart/form-data)
 *   - SendGrid Inbound Parse (multipart/form-data)
 *
 * Vehicle identification (in order of precedence):
 *   1. To subaddress matches a vehicle short ID (8 hex)        → that vehicle
 *   2. To subaddress matches a registered user's email local   → user's first active vehicle
 *   3. Sender email matches a registered user                  → user's first active vehicle
 *   4. Subject contains a vehicle nickname                     → that vehicle
 *
 * Env vars:
 *   EMAIL_WEBHOOK_SECRET            — shared secret (?secret= query param)
 *   NEXT_PUBLIC_CLOUDMAILIN_ADDRESS — e.g. abc123@cloudmailin.net
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processDocument } from "@/lib/costs/processor";
import { isSupportedMimeType } from "@/lib/ai/prompts/document-extraction";

const SHORT_ID_RE = /^[a-f0-9]{8}$/i;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000000";

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

interface VehicleMatch {
  vehicleId: string;
  userId: string;
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function extractSubaddress(toHeader: string): string | null {
  const match = toHeader.match(/\+([^@+\s]+)@/i);
  return match ? match[1].toLowerCase() : null;
}

function extractEmailAddress(rawFrom: string): string {
  return rawFrom.replace(/.*<(.+)>/, "$1").trim().toLowerCase();
}

async function firstActiveVehicle(userId: string, supabase: AdminClient): Promise<string | null> {
  const { data } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  return data ? (data as { id: string }).id : null;
}

async function findUserByEmailLocalPart(localPart: string, supabase: AdminClient): Promise<string | null> {
  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const user = authList?.users.find(
    (u: { id: string; email?: string }) =>
      u.email?.toLowerCase().split("@")[0].replace(/[^a-z0-9]/g, "") === localPart,
  );
  return user?.id ?? null;
}

async function findUserByEmail(email: string, supabase: AdminClient): Promise<string | null> {
  if (!email) return null;
  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const user = authList?.users.find(
    (u: { id: string; email?: string }) => u.email?.toLowerCase() === email,
  );
  return user?.id ?? null;
}

async function findVehicleByNickname(subject: string, supabase: AdminClient): Promise<VehicleMatch | null> {
  if (!subject) return null;
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, user_id, nickname")
    .eq("is_active", true);
  if (!vehicles) return null;

  const lowerSubject = subject.toLowerCase();
  for (const v of vehicles as { id: string; user_id: string; nickname: string | null }[]) {
    if (v.nickname && lowerSubject.includes(v.nickname.toLowerCase())) {
      return { vehicleId: v.id, userId: v.user_id };
    }
  }
  return null;
}

async function resolveVehicle(parsed: ParsedEmail, supabase: AdminClient): Promise<VehicleMatch | null> {
  const subaddress = extractSubaddress(parsed.to);

  console.log("[inbound-email] resolveVehicle", {
    to: parsed.to,
    from: parsed.from,
    subject: parsed.subject,
    subaddress,
    shortIdMatch: subaddress ? SHORT_ID_RE.test(subaddress) : false,
  });

  // 1. Subaddress = vehicle short ID (8 hex chars — first segment of UUID)
  // UUID type in PostgreSQL doesn't support ilike; use range bounds instead.
  if (subaddress && SHORT_ID_RE.test(subaddress)) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, user_id")
      .gte("id", `${subaddress}-0000-0000-0000-000000000000`)
      .lte("id", `${subaddress}-ffff-ffff-ffff-ffffffffffff`)
      .eq("is_active", true)
      .single();
    console.log("[inbound-email] step1 shortId", { subaddress, data: !!data, error: error?.message });
    if (data) {
      const v = data as { id: string; user_id: string };
      return { vehicleId: v.id, userId: v.user_id };
    }
  }

  // 2. Subaddress = user email local part
  if (subaddress) {
    const userId = await findUserByEmailLocalPart(subaddress, supabase);
    console.log("[inbound-email] step2 emailLocalPart", { subaddress, userId });
    if (userId) {
      const vehicleId = await firstActiveVehicle(userId, supabase);
      if (vehicleId) return { vehicleId, userId };
    }
  }

  // 3. Sender email = registered user
  const senderEmail = extractEmailAddress(parsed.from);
  const userIdBySender = await findUserByEmail(senderEmail, supabase);
  console.log("[inbound-email] step3 senderEmail", { senderEmail, userId: userIdBySender });
  if (userIdBySender) {
    const vehicleId = await firstActiveVehicle(userIdBySender, supabase);
    if (vehicleId) return { vehicleId, userId: userIdBySender };
  }

  // 4. Vehicle nickname in subject
  const byNickname = await findVehicleByNickname(parsed.subject, supabase);
  console.log("[inbound-email] step4 nickname", { found: !!byNickname });
  return byNickname;
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

  // Log raw structure to see exactly what Cloudmailin sends
  console.log("[inbound-email] cloudmailin body keys", Object.keys(body));
  console.log("[inbound-email] cloudmailin envelope", body.envelope);
  console.log("[inbound-email] cloudmailin headers type+keys",
    typeof body.headers,
    Array.isArray(body.headers) ? "IS_ARRAY" : Object.keys(body.headers ?? {}),
  );

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

  // Log all field names so we can see exactly what Cloudmailin sends
  const allKeys = [...formData.keys()];
  console.log("[inbound-email] multipart keys", allKeys);

  const to =
    (formData.get("To") as string | null) ??
    (formData.get("to") as string | null) ??
    (formData.get("envelope[to]") as string | null) ??
    (formData.get("headers[To]") as string | null) ??
    (formData.get("headers[to]") as string | null) ??
    "";

  const from =
    (formData.get("From") as string | null) ??
    (formData.get("from") as string | null) ??
    (formData.get("envelope[from]") as string | null) ??
    (formData.get("headers[From]") as string | null) ??
    (formData.get("headers[from]") as string | null) ??
    "";

  const subject =
    (formData.get("Subject") as string | null) ??
    (formData.get("subject") as string | null) ??
    (formData.get("headers[Subject]") as string | null) ??
    (formData.get("headers[subject]") as string | null) ??
    "";

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

  console.log("[inbound-email] parsed", {
    to: parsed.to,
    from: parsed.from,
    subject: parsed.subject,
    attachments: parsed.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType, size: a.buffer.length })),
  });

  if (parsed.attachments.length === 0) {
    return NextResponse.json({ message: "No supported attachments found" }, { status: 200 });
  }

  const supabase = createSupabaseAdminClient();
  const match = await resolveVehicle(parsed, supabase);
  const vehicleId = match?.vehicleId ?? null;
  const userId = match?.userId ?? null;

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
        user_id: userId ?? FALLBACK_USER_ID,
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

  return NextResponse.json({ created: createdIds, skipped, vehicleId, userId }, { status: 200 });
}
