import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { isBulkCountry } from "@/lib/chargers/countries";
import { bulkImportCountry } from "@/lib/chargers/ingest/bulk";
import { ingestArea } from "@/lib/chargers/repository";
import { checkRateLimit } from "@/lib/rate-limit";
import type { BBox } from "@/lib/chargers/types";

// Triggers an ingest from the debug panel. Runs server-side under the admin's
// session, so the browser never needs CRON_SECRET.
export const maxDuration = 300;

// Well under maxDuration on purpose. A request that runs for four minutes dies
// in the browser ("Load failed" in Safari) long before the function stops, so
// the call returns early with progress instead and is tapped again — the
// response carries cellsDone/cells and a complete flag for exactly that.
const BUDGET_MS = 110_000;
const MIN_CELL_MS = 12_000;
// Cells are independent, so a couple run at once; kept low so a burst does not
// trip rate limiting at Overpass or TomTom.
const CELL_CONCURRENCY = 2;
const REGION_CELL_DEG = 0.5;
const MAX_REGION_SQ_DEG = 60;

const BodySchema = z.union([
  z.object({ mode: z.literal("country"), countries: z.array(z.string()).min(1).max(12) }),
  z.object({
    mode: z.literal("region"),
    minLat: z.number().min(-90).max(90),
    minLng: z.number().min(-180).max(180),
    maxLat: z.number().min(-90).max(90),
    maxLng: z.number().min(-180).max(180),
  }),
]);

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  // Each call fans out to third-party APIs and can run for minutes; bound it
  // even for an admin so a stuck retry loop cannot burn provider quota.
  if (!(await checkRateLimit(admin.userId, "debug-ingest", 20))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid body", errors: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const startedAt = Date.now();
  const deadline = startedAt + BUDGET_MS;
  const logs: string[] = [];

  if (parsed.data.mode === "country") {
    const countries = [...new Set(parsed.data.countries.map((c) => c.trim().toLowerCase()))];
    const unknown = countries.filter((c) => !isBulkCountry(c));
    if (unknown.length > 0) {
      return NextResponse.json({ message: `Unknown country: ${unknown.join(", ")}` }, { status: 422 });
    }

    const results: Record<string, unknown> = {};
    for (const cc of countries.filter(isBulkCountry)) {
      if (Date.now() > deadline) {
        results[cc] = { skipped: "budget-exhausted" };
        logs.push(`${cc}: skipped, time budget exhausted`);
        continue;
      }
      try {
        const r = await bulkImportCountry(cc);
        results[cc] = r;
        logs.push(`${cc}: fetched ${r.fetched}, upserted ${r.upserted}, cells ${r.cells}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "failed";
        results[cc] = { error: message };
        logs.push(`${cc}: ERROR ${message}`);
      }
    }
    return NextResponse.json({ mode: "country", elapsedMs: Date.now() - startedAt, results, logs });
  }

  const { minLat, minLng, maxLat, maxLng } = parsed.data;
  if (minLat >= maxLat || minLng >= maxLng) {
    return NextResponse.json({ message: "Empty bbox" }, { status: 422 });
  }
  if ((maxLat - minLat) * (maxLng - minLng) > MAX_REGION_SQ_DEG) {
    return NextResponse.json(
      { message: `Region too large (max ${MAX_REGION_SQ_DEG} sq deg)` },
      { status: 422 },
    );
  }

  const cells: BBox[] = [];
  for (let lat = minLat; lat < maxLat; lat += REGION_CELL_DEG) {
    for (let lng = minLng; lng < maxLng; lng += REGION_CELL_DEG) {
      cells.push({
        minLat: lat,
        minLng: lng,
        maxLat: Math.min(lat + REGION_CELL_DEG, maxLat),
        maxLng: Math.min(lng + REGION_CELL_DEG, maxLng),
      });
    }
  }

  let upserted = 0;
  let done = 0;
  for (let i = 0; i < cells.length; i += CELL_CONCURRENCY) {
    if (Date.now() + MIN_CELL_MS > deadline) break;
    const batch = cells.slice(i, i + CELL_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((cell) => ingestArea(cell)));
    settled.forEach((r, k) => {
      if (r.status === "fulfilled") {
        upserted += r.value.upserted;
      } else {
        const cell = batch[k];
        logs.push(
          `cell ${cell.minLat},${cell.minLng}: ERROR ${
            r.reason instanceof Error ? r.reason.message : "failed"
          }`,
        );
      }
      done++;
    });
  }
  logs.push(`region: ${done}/${cells.length} cells, upserted ${upserted}`);

  return NextResponse.json({
    mode: "region",
    elapsedMs: Date.now() - startedAt,
    cells: cells.length,
    cellsDone: done,
    upserted,
    complete: done === cells.length,
    logs,
  });
}
