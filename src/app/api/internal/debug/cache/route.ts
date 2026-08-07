import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { clearFreshness } from "@/lib/chargers/repository";
import { checkRateLimit } from "@/lib/rate-limit";

// Drops charger freshness markers so an area re-ingests on the next read
// instead of waiting out its TTL. Deletes no charger data — only the
// "this area is up to date" bookkeeping.
export const maxDuration = 60;

const BodySchema = z.object({
  minLat: z.number().min(-90).max(90).optional(),
  minLng: z.number().min(-180).max(180).optional(),
  maxLat: z.number().min(-90).max(90).optional(),
  maxLng: z.number().min(-180).max(180).optional(),
});

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  if (!(await checkRateLimit(admin.userId, "debug-cache", 30))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body" }, { status: 422 });
  }

  const { minLat, minLng, maxLat, maxLng } = parsed.data;
  const hasBBox =
    minLat !== undefined && minLng !== undefined && maxLat !== undefined && maxLng !== undefined;

  if (hasBBox && (minLat >= maxLat || minLng >= maxLng)) {
    return NextResponse.json({ message: "Empty bbox" }, { status: 422 });
  }

  const result = await clearFreshness(
    hasBBox ? { minLat, minLng, maxLat, maxLng } : undefined,
  );

  return NextResponse.json(result);
}
