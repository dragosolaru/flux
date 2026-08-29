import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeOsrmRoute } from "@/lib/external/routing/providers/osrm-router";

/**
 * One road between two points. Not a trip plan.
 *
 * `/api/trip-plan` answers a much bigger question — where to stop, for how
 * long, with what left in the battery — and pays for it in latency and in
 * charger queries. Drawing the way to a station you just tapped needs none of
 * that: it is a line, a distance and a time, and asking the planner for it
 * would be like running a route optimiser to show an arrow.
 *
 * Server-side rather than straight from the browser so the provider stays
 * swappable — there are four in `providers/`, and the one with the API key
 * must never have that key in a page.
 */

const point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const bodySchema = z.object({ from: point, to: point });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  // A route is one outbound call to a public demo server, so this is about not
  // becoming a nuisance to it as much as about protecting us.
  const allowed = await checkRateLimit(session.user.id, "route", 60);
  if (!allowed) {
    return NextResponse.json({ message: "rate-limited" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "bad-request" }, { status: 400 });
  }

  const { from, to } = parsed.data;
  const result = await computeOsrmRoute(from, to);

  return NextResponse.json({
    distanceKm: result.distanceKm,
    drivingMinutes: result.drivingMinutes,
    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng]. Converting here rather
    // than in the component means exactly one place can get it backwards.
    line: (result.polyline?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as [number, number]),
  });
}
