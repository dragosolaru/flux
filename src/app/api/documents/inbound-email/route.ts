/**
 * Inbound email webhook — Cloudmailin "Multipart Normalized" format.
 * Also compatible with Mailgun and SendGrid multipart/form-data.
 *
 * Cloudmailin sends multipart/form-data with bracket-notation fields:
 *   envelope[to], envelope[from], headers[to], headers[subject], attachments[]
 *
 * Vehicle identification (priority order):
 *   1. +subaddress = 8-hex vehicle short ID  → that vehicle
 *   2. +subaddress = user email local part   → user's first active vehicle
 *   3. Sender email = registered user        → user's first active vehicle
 *   4. Subject contains vehicle nickname     → that vehicle
 *
 * Env vars:
 *   EMAIL_WEBHOOK_SECRET            — shared secret, sent in the `x-webhook-secret`
 *                                     HTTP header (the old ?secret= query param was removed;
 *                                     fails closed with 503 if unset)
 *   NEXT_PUBLIC_CLOUDMAILIN_ADDRESS — e.g. abc123@cloudmailin.net
 */

import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processDocument } from "@/lib/costs/processor";
import { isSupportedMimeType } from "@/lib/ai/prompts/document-extraction";
import { checkRateLimit } from "@/lib/rate-limit";

const SHORT_ID_RE = /^[a-f0-9]{8}$/i;
const FULL_UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000000";

function constantTimeEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  const len = Math.max(aBuf.length, bBuf.length);
  const paddedA = Buffer.alloc(len);
  const paddedB = Buffer.alloc(len);
  aBuf.copy(paddedA);
  bBuf.copy(paddedB);
  // Always run timingSafeEqual before checking length so the comparison
  // takes constant time regardless of whether the lengths match.
  const equal = timingSafeEqual(paddedA, paddedB);
  return equal && aBuf.length === bBuf.length;
}

function pickString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" ? v : null;
}

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
  // Exact match only — normalization (strip dots/dashes) causes cross-user collisions
  // (e.g. john.doe@ and johndoe@ both normalize to johndoe).
  const user = authList?.users.find(
    (u: { id: string; email?: string }) =>
      u.email?.toLowerCase().split("@")[0] === localPart,
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

async function resolveVehicle(parsed: ParsedEmail, supabase: AdminClient): Promise<VehicleMatch | null> {
  const subaddress = extractSubaddress(parsed.to);

  // 1a. +subaddress = full vehicle UUID (legacy format: flux+<full-uuid>@...)
  if (subaddress && FULL_UUID_RE.test(subaddress)) {
    const { data } = await supabase
      .from("vehicles")
      .select("id, user_id")
      .eq("id", subaddress)
      .eq("is_active", true)
      .single();
    if (data) {
      const v = data as { id: string; user_id: string };
      return { vehicleId: v.id, userId: v.user_id };
    }
  }

  // 1b. +subaddress = vehicle short ID (first 8 hex chars of UUID)
  // Use range bounds — ilike doesn't work on PostgreSQL uuid columns.
  if (subaddress && SHORT_ID_RE.test(subaddress)) {
    const { data } = await supabase
      .from("vehicles")
      .select("id, user_id")
      .gte("id", `${subaddress}-0000-0000-0000-000000000000`)
      .lte("id", `${subaddress}-ffff-ffff-ffff-ffffffffffff`)
      .eq("is_active", true)
      .single();
    if (data) {
      const v = data as { id: string; user_id: string };
      return { vehicleId: v.id, userId: v.user_id };
    }
  }

  // 2. +subaddress = user email local part
  if (subaddress) {
    const userId = await findUserByEmailLocalPart(subaddress, supabase);
    if (userId) {
      const vehicleId = await firstActiveVehicle(userId, supabase);
      if (vehicleId) return { vehicleId, userId };
    }
  }

  // 3. Sender email = registered user
  const senderEmail = extractEmailAddress(parsed.from);
  if (senderEmail) {
    const userId = await findUserByEmail(senderEmail, supabase);
    if (userId) {
      const vehicleId = await firstActiveVehicle(userId, supabase);
      if (vehicleId) return { vehicleId, userId };
    }
  }

  // No trusted signal matched. Do NOT fall back to scanning vehicle nicknames
  // across all users — that is a cross-tenant IDOR (a spoofed sender could
  // attribute a document to a victim's vehicle). Unmatched mail lands in the
  // FALLBACK_USER_ID pool and is claimable via the sender_email recovery flow.
  return null;
}

interface CloudmailinJsonBody {
  headers?: Record<string, string>;
  envelope?: { to?: string; from?: string };
  attachments?: Array<{
    file_name?: string;
    content_type?: string;
    size?: number;
    content?: string;
    disposition?: string;
  }>;
}

async function parseJsonEmail(request: Request): Promise<ParsedEmail> {
  const body = await request.json() as CloudmailinJsonBody;
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

  // Cloudmailin "Multipart Normalized" uses bracket-notation fields.
  // Mailgun/SendGrid use flat To/From/Subject fields.
  //
  // headers[to] is the literal To: header (preserves +subaddress).
  // envelope[to] is the SMTP RCPT TO and may be normalized by some MX servers
  // (subaddress stripped). Prefer headers[to] first.
  const to =
    pickString(formData, "headers[to]") ??
    pickString(formData, "envelope[to]") ??
    pickString(formData, "To") ??
    pickString(formData, "to") ??
    "";

  const from =
    pickString(formData, "headers[from]") ??
    pickString(formData, "envelope[from]") ??
    pickString(formData, "From") ??
    pickString(formData, "from") ??
    "";

  const subject =
    pickString(formData, "headers[subject]") ??
    pickString(formData, "Subject") ??
    pickString(formData, "subject") ??
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
  // Fail closed: if the secret is not configured the endpoint is disabled entirely.
  // Set EMAIL_WEBHOOK_SECRET in your environment to enable inbound email processing.
  if (!secret) {
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }
  // Header-only — a ?secret= query param would leak into access logs / proxies.
  const headerSecret = request.headers.get("x-webhook-secret");
  if (!headerSecret || !constantTimeEq(headerSecret, secret)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let parsed: ParsedEmail;
  try {
    const ct = request.headers.get("content-type") ?? "";
    parsed = ct.includes("application/json")
      ? await parseJsonEmail(request)
      : await parseMultipartEmail(request);
  } catch {
    return NextResponse.json({ message: "Failed to parse email" }, { status: 400 });
  }

  if (parsed.attachments.length === 0) {
    return NextResponse.json({ message: "No supported attachments found" }, { status: 200 });
  }

  // Rate-limit per sender address to prevent storage exhaustion via webhook flooding.
  const senderEmail = extractEmailAddress(parsed.from) || null;
  if (senderEmail) {
    const allowed = await checkRateLimit(senderEmail, "email-ingest", 20);
    if (!allowed) return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();
  const match = await resolveVehicle(parsed, supabase);
  const vehicleId = match?.vehicleId ?? null;
  const userId = match?.userId ?? null;

  const createdIds: string[] = [];
  const skipped: string[] = [];

  for (const attachment of parsed.attachments) {
    // Sanitize the extension: keep only alphanumeric chars to prevent path-separator
    // injection (e.g. a filename without a dot would otherwise become the whole ext).
    const rawExt = attachment.filename.split(".").pop() ?? "bin";
    const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
    const storagePath = vehicleId && userId
      ? `${userId}/${vehicleId}/${crypto.randomUUID()}.${ext}`
      : `unmatched/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, attachment.buffer, { contentType: attachment.mimeType, upsert: false });

    if (uploadErr) {
      console.error("[inbound-email] storage upload failed:", uploadErr.message, { storagePath });
      skipped.push(attachment.filename);
      continue;
    }

    const { data: doc, error: insertErr } = await supabase
      .from("documents")
      .insert({
        user_id: userId ?? FALLBACK_USER_ID,
        vehicle_id: vehicleId,
        source: "email",
        storage_path: storagePath,
        mime_type: attachment.mimeType,
        original_filename: attachment.filename,
        sender_email: senderEmail,
        status: vehicleId ? "pending" : "needs_review",
      })
      .select("id")
      .single();

    if (insertErr || !doc) {
      console.error("[inbound-email] document insert failed:", insertErr?.message, { userId, vehicleId });
      skipped.push(attachment.filename);
      continue;
    }

    createdIds.push((doc as { id: string }).id);

    if (vehicleId) {
      after(processDocument((doc as { id: string }).id).catch((err: unknown) => {
        console.error("[inbound-email processDocument]", (doc as { id: string }).id, err);
      }));
    }
  }

  // Response intentionally minimal — no vehicleId/userId leak.
  return NextResponse.json({ created: createdIds.length, skipped: skipped.length }, { status: 200 });
}
