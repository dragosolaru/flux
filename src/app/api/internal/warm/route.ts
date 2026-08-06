import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isBulkCountry } from "@/lib/chargers/countries";
import { bulkImportCountry } from "@/lib/chargers/ingest/bulk";
import { constantTimeEqual } from "@/lib/crypto/timing";

// Full-country bulk import endpoint, invoked by the per-country Vercel crons.
// Protected by the x-webhook-secret header; fails closed (503) if unconfigured.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron attaches `Authorization: Bearer $CRON_SECRET`; manual triggers
  // may use the x-webhook-secret header. Fail closed if neither secret is set.
  const cronSecret = process.env.CRON_SECRET;
  const ingestSecret = process.env.INGEST_WEBHOOK_SECRET;
  if (!cronSecret && !ingestSecret) {
    return NextResponse.json({ message: "Warm job not configured" }, { status: 503 });
  }
  const authorized =
    (!!cronSecret && constantTimeEqual(req.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) ||
    (!!ingestSecret && constantTimeEqual(req.headers.get("x-webhook-secret") ?? "", ingestSecret));
  if (!authorized) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Accepts one country or a comma-separated list, so a single cron entry can
  // cover a whole corridor (Vercel plans cap the number of cron jobs).
  const requested = (new URL(req.url).searchParams.get("country") ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);

  const countries = requested.filter(isBulkCountry);
  if (countries.length === 0 || countries.length !== requested.length) {
    return NextResponse.json({ message: "unknown-country" }, { status: 400 });
  }

  // Sequential: each import is memory-heavy and the whole handler shares one
  // 300 s budget, so a parallel fan-out would risk timing out mid-country.
  const results: Record<string, unknown> = {};
  for (const cc of countries) {
    try {
      results[cc] = await bulkImportCountry(cc);
    } catch (err) {
      results[cc] = { error: err instanceof Error ? err.message : "failed" };
    }
  }

  return NextResponse.json({ countries, results });
}
