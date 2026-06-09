import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { findInBBox } from "@/lib/chargers/query";
import { ensureAreaFresh } from "@/lib/chargers/repository";
import type { BBox, ConnectorType } from "@/lib/chargers/types";

export const maxDuration = 30;

const connectorEnum = z.enum([
  "ccs2", "ccs1", "chademo", "type2", "type1", "tesla", "schuko", "other",
]);

const querySchema = z.object({
  bbox: z.string(), // "minLng,minLat,maxLng,maxLat"
  minKw: z.coerce.number().min(0).optional(),
  connector: connectorEnum.optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

function parseBBox(raw: string): BBox | null {
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  if (minLng > maxLng || minLat > maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!(await checkRateLimit(session.user.id, "chargers", 120))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ message: "invalid-query" }, { status: 400 });
  }
  const bbox = parseBBox(parsed.data.bbox);
  if (!bbox) {
    return NextResponse.json({ message: "invalid-bbox" }, { status: 400 });
  }

  await ensureAreaFresh(bbox);

  const chargers = await findInBBox({
    bbox,
    minKw: parsed.data.minKw,
    connector: parsed.data.connector as ConnectorType | undefined,
    minConfidence: parsed.data.minConfidence,
    limit: parsed.data.limit,
  });
  return NextResponse.json(chargers);
}
