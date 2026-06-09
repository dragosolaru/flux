import { NextResponse, after } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { processDocument } from "@/lib/costs/processor";
import { isSupportedMimeType } from "@/lib/ai/prompts/document-extraction";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/costs/constants";
import { canUploadDocument } from "@/lib/subscription";

const MAX_BYTES = 10 * 1024 * 1024;

const GetQuerySchema = z.object({
  vehicleId: z.string().uuid(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = GetQuerySchema.safeParse({ vehicleId: searchParams.get("vehicleId") });
  if (!parsed.success) return NextResponse.json({ message: "vehicleId required" }, { status: 400 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  const supabase = createSupabaseAdminClient();

  // Verify vehicle ownership
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", parsed.data.vehicleId)
    .eq("user_id", userId)
    .single();

  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  const { data: documents, error } = await supabase
    .from("documents")
    .select("id, source, document_type, original_filename, mime_type, storage_path, status, confidence, parsed_json, error_message, created_at, processed_at")
    .eq("vehicle_id", parsed.data.vehicleId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  // Generate short-lived signed URLs for viewing documents
  const docsWithUrls = await Promise.all(
    (documents ?? []).map(async (doc: { storage_path: string } & Record<string, unknown>) => {
      const { data: signed } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...doc, view_url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json(docsWithUrls);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  if (!(await checkRateLimit(userId, "uploads", 10))) {
    return NextResponse.json(
      { message: "Upload limit reached (10/hour). Try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const vehicleId = formData.get("vehicleId");

  if (!(file instanceof File)) return NextResponse.json({ message: "file required" }, { status: 400 });
  if (typeof vehicleId !== "string" || !vehicleId) return NextResponse.json({ message: "vehicleId required" }, { status: 400 });

  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "File too large (max 10 MB)" }, { status: 413 });
  }

  if (!isSupportedMimeType(file.type)) {
    return NextResponse.json({ message: `Unsupported file type: ${file.type}` }, { status: 415 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .single();

  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  const uploadCheck = await canUploadDocument(userId);
  if (!uploadCheck.allowed) {
    return NextResponse.json({ message: uploadCheck.message }, { status: 402 });
  }

  // Sanitize extension: keep only alphanumeric chars to prevent path-separator injection.
  const rawExt = file.name.split(".").pop() ?? "bin";
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
  const storagePath = `${userId}/${vehicleId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) return NextResponse.json({ message: uploadErr.message }, { status: 500 });

  const { data: doc, error: insertErr } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      vehicle_id: vehicleId,
      source: "upload",
      storage_path: storagePath,
      mime_type: file.type,
      original_filename: file.name,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !doc) return NextResponse.json({ message: insertErr?.message ?? "Insert failed" }, { status: 500 });

  after(processDocument(doc.id).catch((err: unknown) => {
    console.error("[processDocument]", doc.id, err);
  }));

  return NextResponse.json({ id: doc.id, status: "pending" }, { status: 202 });
}
