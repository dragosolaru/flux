import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isBulkCountry } from "@/lib/chargers/countries";
import { bulkImportCountry } from "@/lib/chargers/ingest/bulk";

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
    (!!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) ||
    (!!ingestSecret && req.headers.get("x-webhook-secret") === ingestSecret);
  if (!authorized) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const country = new URL(req.url).searchParams.get("country") ?? "";
  if (!isBulkCountry(country)) {
    return NextResponse.json({ message: "unknown-country" }, { status: 400 });
  }

  const result = await bulkImportCountry(country);
  return NextResponse.json({ country, ...result });
}
