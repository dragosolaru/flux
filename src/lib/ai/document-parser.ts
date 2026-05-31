import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  DOCUMENT_EXTRACTION_PROMPT,
  isSupportedMimeType,
} from "./prompts/document-extraction";
import type { ParsedDocument } from "@/types/costs";
import type { Document } from "@/types/costs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ConfidenceSchema = z.object({
  document_type: z.number().min(0).max(1),
  total_kwh: z.number().min(0).max(1),
  cost_total: z.number().min(0).max(1),
  period_start: z.number().min(0).max(1),
  session_timestamp: z.number().min(0).max(1),
});

const ParsedDocumentSchema = z.object({
  document_type: z.enum(["home_bill", "public_receipt", "gas_bill", "petrol_receipt", "other", "unknown"]),
  has_non_electricity_items: z.boolean().default(false),
  provider_name: z.string().nullable(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  session_timestamp: z.string().nullable(),
  total_kwh: z.number().nullable(),
  price_per_kwh: z.number().nullable(),
  electricity_cost: z.number().nullable(),
  cost_total: z.number().nullable(),
  currency: z.string().default("RON"),
  charger_network: z.string().nullable(),
  location_name: z.string().nullable(),
  confidence: ConfidenceSchema,
});

export async function parseDocument(doc: Document): Promise<ParsedDocument> {
  const supabase = createSupabaseAdminClient();

  const { data: fileData, error } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);

  if (error || !fileData) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = doc.mime_type;

  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  type ContentBlock =
    | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
    | { type: "text"; text: string };

  const contentBlocks: ContentBlock[] = [];

  if (mimeType === "application/pdf") {
    contentBlocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    });
  } else {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType as ImageMediaType,
        data: base64,
      },
    });
  }

  contentBlocks.push({ type: "text", text: DOCUMENT_EXTRACTION_PROMPT });

  let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: contentBlocks }],
    });
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) throw new Error("Cheia API Anthropic este invalidă. Verifică ANTHROPIC_API_KEY în setările Vercel.");
      if (err.status === 402 || (err.message && err.message.includes("credit balance"))) {
        throw new Error("Credite Anthropic insuficiente. Adaugă credite la console.anthropic.com/settings/billing.");
      }
      if (err.status === 429) throw new Error("Prea multe cereri către Anthropic. Încearcă din nou în câteva secunde.");
      if (err.status >= 500) throw new Error("Serviciul Anthropic este temporar indisponibil. Încearcă din nou.");
    }
    throw err;
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Strip markdown code fences if Claude wraps the JSON
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 200)}`);
  }

  return ParsedDocumentSchema.parse(raw);
}
