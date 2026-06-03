import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { findNearby } from "@/lib/chargers/query";
import { ensureAreaFresh } from "@/lib/chargers/repository";
import { radiusToBBox } from "@/lib/chargers/tiles";
import type { ConnectorType } from "@/lib/chargers/types";

export const maxDuration = 30;

const connectorEnum = z.enum([
  "ccs2", "ccs1", "chademo", "type2", "type1", "tesla", "schuko", "other",
]);

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(0.5).max(100).default(25),
  minKw: z.coerce.number().min(0).optional(),
  connector: connectorEnum.optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

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
  const { lat, lng, radius, minKw, connector, minConfidence, limit } = parsed.data;

  await ensureAreaFresh(radiusToBBox(lat, lng, radius));

  const chargers = await findNearby({
    lat, lng, radiusKm: radius,
    minKw, connector: connector as ConnectorType | undefined, minConfidence, limit,
  });
  return NextResponse.json(chargers);
}
