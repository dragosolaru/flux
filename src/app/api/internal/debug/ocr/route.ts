import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { parseDocumentBytes } from "@/lib/ai/document-parser";
import { checkRateLimit } from "@/lib/rate-limit";

// Runs a photo or PDF through the extraction prompts and returns what Claude
// produced. Nothing is stored: no document row, no upload to the bucket, no
// cost record — so a prompt can be tried against a real receipt without
// leaving anything behind to clean up.
export const maxDuration = 120;

// Roughly 4 MB of base64, under the platform body limit. A phone photo is well
// inside this; a multi-page scan may not be.
const MAX_BASE64_CHARS = 4_000_000;

const BodySchema = z.object({
  base64: z.string().min(1).max(MAX_BASE64_CHARS),
  mimeType: z.string().min(1).max(120),
  variant: z.enum(["energy", "car"]).default("energy"),
});

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  // Each call costs real Anthropic tokens.
  if (!(await checkRateLimit(admin.userId, "debug-ocr", 40))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const tooBig = typeof (raw as { base64?: string })?.base64 === "string" &&
      (raw as { base64: string }).base64.length > MAX_BASE64_CHARS;
    return NextResponse.json(
      { message: tooBig ? "File too large — try a smaller photo" : "Invalid body" },
      { status: 422 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await parseDocumentBytes(
      parsed.data.base64,
      parsed.data.mimeType,
      parsed.data.variant,
    );
    return NextResponse.json({
      variant: parsed.data.variant,
      elapsedMs: Date.now() - startedAt,
      result,
    });
  } catch (err) {
    // Verbatim: seeing why extraction failed is the point of this endpoint.
    return NextResponse.json(
      {
        message: err instanceof Error ? err.message : "Extraction failed",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
