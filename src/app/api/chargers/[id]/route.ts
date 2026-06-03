import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCharger } from "@/lib/chargers/query";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!(await checkRateLimit(session.user.id, "chargers", 120))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const { id } = await params;
  const charger = await getCharger(id);
  if (!charger) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json(charger);
}
