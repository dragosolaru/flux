import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ingestArea } from "@/lib/chargers/repository";
import type { BBox } from "@/lib/chargers/types";

// Scheduled warm-refresh of hot regions so the most-used areas are always fresh.
// Protected by the x-webhook-secret header; fails closed (503) if unconfigured.
export const maxDuration = 60;

// Hot regions: Romania core + major EU corridor anchors. Each is ingested as one
// bbox (the orchestrator tiles + dedups internally).
const HOT_REGIONS: Record<string, BBox[]> = {
  ro: [
    { minLng: 23.4, minLat: 46.6, maxLng: 23.8, maxLat: 46.9 }, // Cluj / Florești
    { minLng: 25.9, minLat: 44.3, maxLng: 26.3, maxLat: 44.6 }, // Bucharest
    { minLng: 25.5, minLat: 45.6, maxLng: 25.7, maxLat: 45.8 }, // Brașov
    { minLng: 21.1, minLat: 45.7, maxLng: 21.3, maxLat: 45.85 }, // Timișoara
    { minLng: 27.5, minLat: 47.1, maxLng: 27.7, maxLat: 47.25 }, // Iași
  ],
  eu: [
    { minLng: 8.5, minLat: 50.0, maxLng: 8.8, maxLat: 50.2 },   // Frankfurt
    { minLng: 16.3, minLat: 48.1, maxLng: 16.5, maxLat: 48.3 }, // Vienna
    { minLng: 19.0, minLat: 47.4, maxLng: 19.2, maxLat: 47.6 }, // Budapest
  ],
};

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

  const region = new URL(req.url).searchParams.get("region") ?? "ro";
  const boxes = HOT_REGIONS[region];
  if (!boxes) {
    return NextResponse.json({ message: "unknown-region" }, { status: 400 });
  }

  let upserted = 0;
  for (const bbox of boxes) {
    const r = await ingestArea(bbox);
    upserted += r.upserted;
  }
  return NextResponse.json({ region, regions: boxes.length, upserted });
}
