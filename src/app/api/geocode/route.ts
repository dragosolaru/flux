import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; city?: string; country?: string; street?: string; housenumber?: string };
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
  const acceptLanguage = req.headers.get("accept-language") ?? "en,ro,de,fr,hu";

  const nominatimParams = new URLSearchParams({
    format: "json",
    addressdetails: "1",
    limit: "6",
    q,
  });

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${nominatimParams.toString()}`,
      {
        headers: {
          "User-Agent": "Flux-TripPlanner/1.0 (contact@daolab.io)",
          "Accept-Language": acceptLanguage,
        },
        next: { revalidate: 300 },
      },
    );

    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = (await res.json()) as NominatimResult[];

    if (data.length > 0) {
      return NextResponse.json({
        results: data.map((r) => ({
          name: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
        })),
      });
    }

    // Nominatim returned nothing — try Photon for better fuzzy/partial matching
    // (handles Romanian bloc addresses, business names, street fragments better).
    const photonRes = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=default`,
      {
        headers: { "User-Agent": "Flux-TripPlanner/1.0" },
        next: { revalidate: 300 },
      },
    );

    if (!photonRes.ok) return NextResponse.json({ results: [] });
    const photonData = (await photonRes.json()) as { features?: PhotonFeature[] };
    const features = photonData.features ?? [];

    return NextResponse.json({
      results: features.map((f) => {
        const p = f.properties;
        const parts = [p.name, p.street, p.city, p.country].filter(Boolean);
        const displayName = parts.length > 0 ? parts.join(", ") : q;
        const [lng, lat] = f.geometry.coordinates;
        return { name: displayName, lat, lng };
      }),
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
