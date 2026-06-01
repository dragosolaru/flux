import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  if (!(await checkRateLimit(session.user.id, "geocode", 60))) {
    return NextResponse.json({ results: [] }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Flux-TripPlanner/1.0 (contact@daolab.io)",
        "Accept-Language": "en",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json() as NominatimResult[];

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
