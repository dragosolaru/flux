import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

// Powers a debounced typeahead — every pause while typing is one request, so the
// quota has to be generous or searches silently return empty and the UI shows
// "no results". 600/h ≈ 10/min of active typing, plenty for trip planning.
const GEOCODE_MAX_PER_HOUR = 600;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  if (!(await checkRateLimit(session.user.id, "geocode", GEOCODE_MAX_PER_HOUR))) {
    return NextResponse.json({ results: [] }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Forward the user's language so cities/streets resolve in their locale
  // (e.g. "București", "Köln") instead of forced English. Fall back to a broad
  // set so varied input still matches.
  const acceptLanguage =
    req.headers.get("accept-language") ?? "en,ro,de,fr,hu";

  const params = new URLSearchParams({
    format: "json",
    addressdetails: "1",
    limit: "8",
    q,
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Flux-TripPlanner/1.0 (contact@daolab.io)",
        "Accept-Language": acceptLanguage,
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = (await res.json()) as NominatimResult[];

    return NextResponse.json({
      results: data.map((r) => ({
        name: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      })),
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
