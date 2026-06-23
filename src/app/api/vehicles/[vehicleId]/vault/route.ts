import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { VaultDocument } from "@/types/costs";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/costs/constants";

const CAR_DOC_TYPES = ["rca", "casco", "itp", "rovinieta", "vignette", "bridge_toll", "car_tax", "service", "parking", "fuel", "tires", "fine", "highway_toll", "car_wash", "leasing", "roadside_assistance", "spare_parts", "ferry"];
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "vault-read", 300))) {
    return NextResponse.json(
      { message: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  const [{ data: docs }, { data: metas }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, document_type, original_filename, mime_type, status, parsed_json, created_at, processed_at, storage_path")
      .eq("vehicle_id", vehicleId)
      .eq("user_id", session.user.id)
      .or(`document_type.in.(${CAR_DOC_TYPES.join(",")}),status.in.(pending,processing)`)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("vehicle_doc_meta")
      .select("document_id, plate_number, valid_from, valid_until, issuer, amount_ron")
      .eq("vehicle_id", vehicleId),
  ]);

  const now = Date.now();

  type MetaRow = {
    document_id: string;
    plate_number: string | null;
    valid_from: string | null;
    valid_until: string | null;
    issuer: string | null;
    amount_ron: number | null;
  };

  const metaByDocId = new Map<string, MetaRow>(
    (metas ?? []).map((m: MetaRow) => [m.document_id, m]),
  );

  type DocRow = {
    id: string;
    document_type: string | null;
    original_filename: string | null;
    mime_type: string;
    status: string;
    parsed_json: Record<string, unknown> | null;
    created_at: string;
    processed_at: string | null;
    storage_path: string;
  };

  const results: VaultDocument[] = await Promise.all(
    (docs ?? []).map(async (doc: DocRow) => {
      const { data: signed } = doc.storage_path
        ? await supabase.storage.from("documents").createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS)
        : { data: null };

      const meta = metaByDocId.get(doc.id);
      const pj = doc.parsed_json;

      const plate_number = meta?.plate_number ?? (pj?.plate_number as string | null) ?? null;
      const valid_from = meta?.valid_from ?? (pj?.valid_from as string | null) ?? null;
      const valid_until = meta?.valid_until ?? (pj?.valid_until as string | null) ?? null;
      const issuer = meta?.issuer ?? (pj?.issuer as string | null) ?? null;
      const amount_ron = meta?.amount_ron ?? null;

      let days_until_expiry: number | null = null;
      if (valid_until) {
        const expiry = new Date(valid_until).getTime();
        days_until_expiry = Math.ceil((expiry - now) / 86_400_000);
      }

      const isStuck =
        (doc.status === "processing" || doc.status === "pending") &&
        now - new Date(doc.created_at).getTime() > PROCESSING_TIMEOUT_MS;

      return {
        id: doc.id,
        document_type: (doc.document_type as VaultDocument["document_type"]) ?? null,
        original_filename: doc.original_filename,
        mime_type: doc.mime_type,
        status: isStuck ? "error" : (doc.status as VaultDocument["status"]),
        view_url: signed?.signedUrl ?? null,
        created_at: doc.created_at,
        processed_at: doc.processed_at,
        plate_number,
        valid_from,
        valid_until,
        amount_ron,
        issuer,
        days_until_expiry,
      };
    }),
  );

  return NextResponse.json(results);
}

const ManualDocSchema = z.object({
  document_type: z.enum(["rca", "casco", "itp", "rovinieta", "vignette", "bridge_toll", "car_tax", "service", "parking", "fuel", "tires", "fine", "highway_toll", "car_wash", "leasing", "roadside_assistance", "spare_parts", "ferry", "other"]),
  amount_ron: z.number().positive().nullable().optional(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  issuer: z.string().max(200).nullable().optional(),
  plate_number: z.string().max(20).nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "vault-write", 60))) {
    return NextResponse.json(
      { message: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ManualDocSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body", errors: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  const { document_type, amount_ron, valid_from, valid_until, issuer, plate_number } = parsed.data;

  const { data: doc, error: insertErr } = await supabase
    .from("documents")
    .insert({
      user_id: session.user.id,
      vehicle_id: vehicleId,
      source: "manual",
      document_type,
      storage_path: "",
      mime_type: "",
      original_filename: null,
      status: "done",
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !doc) {
    console.error("[vault/POST]", insertErr?.message ?? "Insert failed");
    return NextResponse.json({ message: "Save failed" }, { status: 500 });
  }

  if (amount_ron != null || valid_from != null || valid_until != null || issuer != null || plate_number != null) {
    const { error: metaErr } = await supabase.from("vehicle_doc_meta").insert({
      document_id: doc.id,
      vehicle_id: vehicleId,
      plate_number: plate_number ?? null,
      valid_from: valid_from ?? null,
      valid_until: valid_until ?? null,
      issuer: issuer ?? null,
      amount_ron: amount_ron ?? null,
    });
    if (metaErr) {
      console.error("[vault/POST meta]", metaErr.message);
    }
  }

  return NextResponse.json({ id: doc.id }, { status: 201 });
}
