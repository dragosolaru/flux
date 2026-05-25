/**
 * Inbound WhatsApp webhook — Twilio format.
 *
 * Twilio sends a POST with application/x-www-form-urlencoded:
 *   From:               whatsapp:+40712345678
 *   To:                 whatsapp:+14155238886
 *   Body:               message text (e.g. vehicle nickname)
 *   NumMedia:           number of attached media files
 *   MediaUrl0, ...:     URLs to media files (authenticated via Basic auth)
 *   MediaContentType0, ...: content types
 *
 * Vehicle identification (priority order):
 *   1. Body text contains vehicle nickname → that vehicle
 *   2. First active vehicle of any user (single-user fallback)
 *
 * Env vars:
 *   TWILIO_WEBHOOK_SECRET  — shared secret (x-twilio-signature header)
 *   TWILIO_ACCOUNT_SID     — for Basic auth when downloading media
 *   TWILIO_AUTH_TOKEN      — for Basic auth when downloading media
 */

import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processDocument } from "@/lib/costs/processor";
import { isSupportedMimeType } from "@/lib/ai/prompts/document-extraction";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000000";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface VehicleMatch {
  vehicleId: string;
  userId: string;
}

function constantTimeEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function pickString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" ? v : null;
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

async function findVehicleByNickname(bodyText: string, supabase: AdminClient): Promise<VehicleMatch | null> {
  if (!bodyText) return null;
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, user_id, nickname")
    .eq("is_active", true);
  if (!vehicles) return null;

  const lower = bodyText.toLowerCase();
  for (const v of vehicles as { id: string; user_id: string; nickname: string | null }[]) {
    if (v.nickname && lower.includes(v.nickname.toLowerCase())) {
      return { vehicleId: v.id, userId: v.user_id };
    }
  }
  return null;
}

async function firstVehicleAnyUser(supabase: AdminClient): Promise<VehicleMatch | null> {
  const { data } = await supabase
    .from("vehicles")
    .select("id, user_id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!data) return null;
  const v = data as { id: string; user_id: string };
  return { vehicleId: v.id, userId: v.user_id };
}

async function resolveVehicle(bodyText: string, supabase: AdminClient): Promise<VehicleMatch | null> {
  // 1. Body text contains a vehicle nickname
  const byNickname = await findVehicleByNickname(bodyText, supabase);
  if (byNickname) return byNickname;

  // 2. Single-user/single-vehicle fallback
  return firstVehicleAnyUser(supabase);
}

export async function POST(request: Request) {
  const secret = process.env.TWILIO_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse("Webhook not configured", { status: 503 });
  }

  const headerSecret = request.headers.get("x-twilio-signature");
  if (!headerSecret || !constantTimeEq(headerSecret, secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse("Failed to parse form body", { status: 400 });
  }

  const rawFrom = pickString(formData, "From") ?? "";
  const fromPhone = rawFrom.replace(/^whatsapp:/i, "");

  if (!checkRateLimit(fromPhone || "unknown", "whatsapp-ingest", 10)) {
    return new NextResponse("Rate limit exceeded", { status: 429 });
  }

  const numMediaStr = pickString(formData, "NumMedia") ?? "0";
  const numMedia = parseInt(numMediaStr, 10);

  if (isNaN(numMedia) || numMedia < 1) {
    return new NextResponse(
      `<Response><Message>No media attached — send an image or PDF of your receipt.</Message></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml" } },
    );
  }

  const bodyText = pickString(formData, "Body") ?? "";
  const supabase = createSupabaseAdminClient();
  const match = await resolveVehicle(bodyText, supabase);
  const vehicleId = match?.vehicleId ?? null;
  const userId = match?.userId ?? null;

  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const createdIds: string[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = pickString(formData, `MediaUrl${i}`);
    const mediaContentType = pickString(formData, `MediaContentType${i}`) ?? "application/octet-stream";

    if (!mediaUrl) {
      skipped.push(`MediaUrl${i}`);
      continue;
    }

    if (!isSupportedMimeType(mediaContentType)) {
      skipped.push(mediaUrl);
      continue;
    }

    let buffer: Buffer;
    try {
      const resp = await fetch(mediaUrl, {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      if (!resp.ok) {
        console.error("[inbound-whatsapp] media fetch failed:", resp.status, mediaUrl);
        skipped.push(mediaUrl);
        continue;
      }
      const arrayBuf = await resp.arrayBuffer();
      if (arrayBuf.byteLength > MAX_MEDIA_BYTES) {
        console.error("[inbound-whatsapp] media too large:", arrayBuf.byteLength, mediaUrl);
        skipped.push(mediaUrl);
        continue;
      }
      buffer = Buffer.from(arrayBuf);
    } catch (err) {
      console.error("[inbound-whatsapp] media fetch error:", err, mediaUrl);
      skipped.push(mediaUrl);
      continue;
    }

    const ext = mediaContentType.split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
    const storagePath = vehicleId && userId
      ? `${userId}/${vehicleId}/${crypto.randomUUID()}.${ext}`
      : `unmatched/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, buffer, { contentType: mediaContentType, upsert: false });

    if (uploadErr) {
      console.error("[inbound-whatsapp] storage upload failed:", uploadErr.message, { storagePath });
      skipped.push(mediaUrl);
      continue;
    }

    const { data: doc, error: insertErr } = await supabase
      .from("documents")
      .insert({
        user_id: userId ?? FALLBACK_USER_ID,
        vehicle_id: vehicleId,
        source: "whatsapp",
        storage_path: storagePath,
        mime_type: mediaContentType,
        original_filename: `whatsapp-${i}.${ext}`,
        sender_phone: fromPhone || null,
        status: vehicleId ? "pending" : "needs_review",
      })
      .select("id")
      .single();

    if (insertErr || !doc) {
      console.error("[inbound-whatsapp] document insert failed:", insertErr?.message, { userId, vehicleId });
      skipped.push(mediaUrl);
      continue;
    }

    createdIds.push((doc as { id: string }).id);

    if (vehicleId) {
      after(processDocument((doc as { id: string }).id).catch((err: unknown) => {
        console.error("[inbound-whatsapp processDocument]", (doc as { id: string }).id, err);
      }));
    }
  }

  const responseText = createdIds.length > 0
    ? `Receipt processed ✓`
    : `Could not process media (${skipped.length} skipped).`;

  return new NextResponse(
    `<Response><Message>${responseText}</Message></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}
