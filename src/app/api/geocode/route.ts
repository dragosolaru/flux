import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export interface GeocodeHit {
  name: string;
  lat: number;
  lng: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; city?: string; country?: string; street?: string; housenumber?: string };
}

interface TomTomResult {
  poi?: { name?: string | null } | null;
  address?: { freeformAddress?: string | null } | null;
  position?: { lat?: number | null; lon?: number | null } | null;
}

// Powers a debounced typeahead — every pause while typing is one request, so the
// quota has to be generous or searches silently return empty and the UI shows
// "no results". 600/h ≈ 10/min of active typing, plenty for trip planning.
const GEOCODE_MAX_PER_HOUR = 600;

// TomTom Search (fuzzy) — primary. Excellent global coverage incl. small places
// (e.g. Ksamil, AL) + typo tolerance, reliable from serverless. Needs the key.
async function tomtomSearch(q: string): Promise<GeocodeHit[]> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return [];
  const url = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("limit", "6");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: TomTomResult[] };
  const out: GeocodeHit[] = [];
  for (const r of data.results ?? []) {
    const lat = r.position?.lat;
    const lng = r.position?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const name =
      [r.poi?.name, r.address?.freeformAddress].filter(Boolean).join(", ") ||
      r.address?.freeformAddress ||
      q;
    out.push({ name, lat, lng });
  }
  return out;
}

// Photon (Komoot, OSM) — free, no key, good fuzzy matching. Secondary fallback.
async function photonSearch(q: string): Promise<GeocodeHit[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=default`,
    { headers: { "User-Agent": "Flux-TripPlanner/1.0" }, signal: AbortSignal.timeout(8000), next: { revalidate: 300 } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? []).map((f) => {
    const p = f.properties;
    const name = [p.name, p.street, p.city, p.country].filter(Boolean).join(", ") || q;
    const [lng, lat] = f.geometry.coordinates;
    return { name, lat, lng };
  });
}

// Nominatim (OSM) — free, no key, but rate-limited on shared IPs. Last fallback.
async function nominatimSearch(q: string, acceptLanguage: string): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({ format: "json", addressdetails: "1", limit: "6", q });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { "User-Agent": "Flux-TripPlanner/1.0 (contact@daolab.io)", "Accept-Language": acceptLanguage },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NominatimResult[];
  return data.map((r) => ({ name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
}

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

  const acceptLanguage = req.headers.get("accept-language") ?? "en,ro,de,fr,hu";

  // Try providers in order of reliability/coverage; each is isolated so a failing
  // or blocked provider falls through to the next instead of returning empty.
  const providers: Array<() => Promise<GeocodeHit[]>> = [
    () => tomtomSearch(q),
    () => photonSearch(q),
    () => nominatimSearch(q, acceptLanguage),
  ];

  for (const provider of providers) {
    try {
      const results = await provider();
      if (results.length > 0) return NextResponse.json({ results });
    } catch {
      // try the next provider
    }
  }

  return NextResponse.json({ results: [] });
}
