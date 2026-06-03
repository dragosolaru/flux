import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchChargers } from "@/lib/chargers/query";

const querySchema = z.object({
  q: z.string().min(2).max(120),
  country: z.string().length(2).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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

  const chargers = await searchChargers(parsed.data);
  return NextResponse.json(chargers);
}
