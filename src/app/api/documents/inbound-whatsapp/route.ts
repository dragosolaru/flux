import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processDocument } from "@/lib/costs/processor";
import { isSupportedMimeType } from "@/lib/ai/prompts/document-extraction";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000000";

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

/**
 * Validate Twilio's X-Twilio-Signature. Twilio signs HMAC-SHA1 of
 * (full URL + each POST param key+value, sorted by key) keyed by the
 * account Auth Token, base64-encoded. A static shared secret is NOT a
 * valid Twilio signature, so we compute the real HMAC and compare.
 */
function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  const expected = createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  return constantTimeEq(expected, signature);
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return new NextResponse("Webhook not configured", { status: 503 });
  }

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse("Failed to parse form body", { status: 400 });
  }

  // Twilio signs the exact public URL it called. Behind proxies the runtime
  // request URL can differ, so prefer the explicitly configured webhook URL.
  const params: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") params[k] = v;
  }
  const signedUrl = process.env.TWILIO_WEBHOOK_URL ?? request.url;
  if (!validateTwilioSignature(authToken, signature, signedUrl, params)) {
    return new NextResponse("Unauthorized", { status: 401 });
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

  const supabase = createSupabaseAdminClient();

  // WhatsApp has no trusted phone→user mapping, so we cannot safely attribute
  // media to a specific user without a cross-tenant IDOR. All inbound media
  // lands in the unmatched pool (needs_review) until a phone-registration
  // claim flow exists.
  const vehicleId: string | null = null;
  const userId: string | null = null;

  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
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
