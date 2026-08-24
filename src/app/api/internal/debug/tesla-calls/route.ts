import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { readTeslaCalls } from "@/lib/tesla/call-log";

/**
 * What we actually sent to Tesla in the last 24 hours.
 *
 * This is the panel that answers "how do we know the app is not keeping the car
 * awake". Every other answer is an assertion about code; this one is a count
 * taken at the last point before the request leaves.
 *
 * `wake` is the number that matters. It should be zero on a day nobody pressed
 * "wake the car", and any other value is a bug with a timestamp attached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // 404 rather than 403: an admin-only route should not confirm it exists.
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  return NextResponse.json(await readTeslaCalls());
}
