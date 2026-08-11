import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  DOCUMENT_EXTRACTION_PROMPT,
  isSupportedMimeType,
} from "./prompts/document-extraction";
import { CAR_DOCUMENT_EXTRACTION_PROMPT } from "./prompts/car-document-extraction";
import type { ParsedDocument } from "@/types/costs";
import type { Document } from "@/types/costs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORY_VALUES = [
  "insurance", "registration", "inspection", "tax", "toll",
  "operating", "maintenance", "financing", "incident", "driver",
  "energy", "other",
] as const;

const ConfidenceSchema = z.object({
  document_type: z.number().min(0).max(1).catch(0),
  total_kwh: z.number().min(0).max(1).catch(0),
  cost_total: z.number().min(0).max(1).catch(0),
  period_start: z.number().min(0).max(1).catch(0),
  session_timestamp: z.number().min(0).max(1).catch(0),
  valid_until: z.number().min(0).max(1).optional(),
});

const ParsedDocumentSchema = z.object({
  document_type: z.enum(["home_bill", "public_receipt", "gas_bill", "petrol_receipt", "other", "unknown", "rca", "casco", "itp", "rovinieta", "vignette", "bridge_toll", "car_tax", "service", "parking", "fuel", "tires", "fine", "highway_toll", "car_wash", "leasing", "roadside_assistance", "spare_parts", "ferry"]),
  label: z.string().max(60).nullable().default(null),
  category: z.enum(CATEGORY_VALUES).nullable().catch(null).default(null),
  has_non_electricity_items: z.boolean().default(false),
  provider_name: z.string().nullable().default(null),
  period_start: z.string().nullable().default(null),
  period_end: z.string().nullable().default(null),
  session_timestamp: z.string().nullable().default(null),
  total_kwh: z.number().nullable().default(null),
  price_per_kwh: z.number().nullable().default(null),
  electricity_cost: z.number().nullable().default(null),
  cost_total: z.number().nullable().default(null),
  currency: z.string().default("RON"),
  charger_network: z.string().nullable().default(null),
  location_name: z.string().nullable().default(null),
  plate_number: z.string().nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  issuer: z.string().nullable().optional(),
  confidence: ConfidenceSchema,
});

const CarDocConfidenceSchema = z.object({
  document_type: z.number().min(0).max(1).catch(0),
  valid_until: z.number().min(0).max(1).catch(0),
  cost_total: z.number().min(0).max(1).catch(0),
  plate_number: z.number().min(0).max(1).catch(0),
});

const CarDocSchema = z.object({
  document_type: z.enum(["rca", "casco", "itp", "rovinieta", "vignette", "bridge_toll", "car_tax", "service", "parking", "fuel", "tires", "fine", "highway_toll", "car_wash", "leasing", "roadside_assistance", "spare_parts", "ferry", "talon", "other", "unknown"]),
  label: z.string().max(60).nullable().default(null),
  category: z.enum(CATEGORY_VALUES).nullable().catch(null).default(null),
  plate_number: z.string().nullable().default(null),
  valid_from: z.string().nullable().default(null),
  valid_until: z.string().nullable().default(null),
  issuer: z.string().nullable().default(null),
  provider_name: z.string().nullable().default(null),
  cost_total: z.number().nullable().default(null),
  currency: z.string().default("RON"),
  confidence: CarDocConfidenceSchema,
});

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
type ContentBlock =
  | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "text"; text: string };

async function downloadDoc(doc: Document): Promise<{ base64: string; mimeType: string }> {
  const supabase = createSupabaseAdminClient();
  const { data: fileData, error } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);

  if (error || !fileData) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType: doc.mime_type };
}

function buildContentBlocks(base64: string, mimeType: string, prompt: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (mimeType === "application/pdf") {
    blocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    });
  } else {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType as ImageMediaType,
        data: base64,
      },
    });
  }

  blocks.push({ type: "text", text: prompt });
  return blocks;
}

async function callClaude(contentBlocks: ContentBlock[]): Promise<string> {
  let response: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: contentBlocks }],
    });
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) throw new Error("OCR service configuration error. Contact support.");
      if (err.status === 402 || (err.message && err.message.includes("credit balance"))) {
        throw new Error("OCR service temporarily unavailable. Please try again later.");
      }
      if (err.status === 429) throw new Error("OCR service is busy. Please try again in a few seconds.");
      if (err.status >= 500) throw new Error("OCR service temporarily unavailable. Please try again.");
    }
    throw err;
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export type ParseVariant = "energy" | "car";

/**
 * Shared step: send the bytes with a prompt and return the parsed JSON. The
 * two variants diverge only afterwards — the energy response validates
 * straight into ParsedDocument, the car response has its own schema and is
 * mapped across.
 */
async function extractJson(
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<unknown> {
  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  const jsonText = await callClaude(buildContentBlocks(base64, mimeType, prompt));

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${jsonText.slice(0, 200)}`);
  }
}

function mapCarDoc(raw: unknown): ParsedDocument {
  const carDoc = CarDocSchema.parse(raw);

  return {
    document_type: carDoc.document_type,
    label: carDoc.label,
    category: carDoc.category,
    has_non_electricity_items: false,
    provider_name: carDoc.provider_name,
    period_start: carDoc.valid_from ?? null,
    period_end: carDoc.valid_until ?? null,
    session_timestamp: null,
    total_kwh: null,
    price_per_kwh: null,
    electricity_cost: null,
    cost_total: carDoc.cost_total,
    currency: carDoc.currency,
    charger_network: null,
    location_name: null,
    plate_number: carDoc.plate_number,
    valid_from: carDoc.valid_from,
    valid_until: carDoc.valid_until,
    issuer: carDoc.issuer,
    // Only what a vehicle document actually has. These three used to be 0,
    // which averageConfidence then counted: a flawless extraction scored
    // (1+0+1+0+0+1)/6 = 0.5 against a 0.7 threshold, so no car document could
    // ever reach `done` — and the vault calendar only exports documents that
    // are done.
    confidence: {
      document_type: carDoc.confidence.document_type,
      cost_total: carDoc.confidence.cost_total,
      valid_until: carDoc.confidence.valid_until,
    },
  };
}

/**
 * Parse bytes already in hand, skipping the storage download.
 *
 * The stored-document entry points below wrap this. Kept separate so a caller
 * can extract from an upload without persisting it first — the debug panel
 * tries a photo against the prompts without creating a document row or writing
 * to the bucket.
 */
export async function parseDocumentBytes(
  base64: string,
  mimeType: string,
  variant: ParseVariant = "energy",
): Promise<ParsedDocument> {
  if (variant === "car") {
    return mapCarDoc(await extractJson(base64, mimeType, CAR_DOCUMENT_EXTRACTION_PROMPT));
  }
  return ParsedDocumentSchema.parse(
    await extractJson(base64, mimeType, DOCUMENT_EXTRACTION_PROMPT),
  );
}

export async function parseDocument(doc: Document): Promise<ParsedDocument> {
  const { base64, mimeType } = await downloadDoc(doc);
  return parseDocumentBytes(base64, mimeType, "energy");
}

export async function parseCarDocument(doc: Document): Promise<ParsedDocument> {
  const { base64, mimeType } = await downloadDoc(doc);
  return parseDocumentBytes(base64, mimeType, "car");
}
