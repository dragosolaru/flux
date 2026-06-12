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

interface GeocodeBias {
  lat: number;
  lng: number;
}

function parseBias(sp: URLSearchParams): GeocodeBias | null {
  const latRaw = sp.get("lat");
  const lngRaw = sp.get("lng");
  if (!latRaw || !lngRaw) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseCountryCodes(sp: URLSearchParams): string | null {
  const cc = sp.get("cc");
  if (!cc || !/^[a-z]{2}(,[a-z]{2})*$/i.test(cc)) return null;
  return cc.toLowerCase();
}

// TomTom Search (fuzzy) — primary. Excellent global coverage incl. small places
// (e.g. Ksamil, AL) + typo tolerance, reliable from serverless. Needs the key.
async function tomtomSearch(q: string, bias: GeocodeBias | null, cc: string | null): Promise<GeocodeHit[]> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return [];
  const url = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("limit", "6");
  if (bias) {
    url.searchParams.set("lat", String(bias.lat));
    url.searchParams.set("lon", String(bias.lng));
  }
  if (cc) url.searchParams.set("countrySet", cc);
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
// No country filter support; bias-only.
async function photonSearch(q: string, bias: GeocodeBias | null): Promise<GeocodeHit[]> {
  const biasParams = bias ? `&lat=${bias.lat}&lon=${bias.lng}` : "";
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=default${biasParams}`,
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
async function nominatimSearch(q: string, acceptLanguage: string, bias: GeocodeBias | null, cc: string | null): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({ format: "json", addressdetails: "1", limit: "6", q });
  // Nominatim has no true bias param; an unbounded viewbox weights results
  // toward the preferred area without excluding the rest of the world.
  if (bias) {
    params.set("viewbox", `${bias.lng - 3},${bias.lat + 3},${bias.lng + 3},${bias.lat - 3}`);
    params.set("bounded", "0");
  }
  if (cc) params.set("countrycodes", cc);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { "User-Agent": "Flux-TripPlanner/1.0 (contact@daolab.io)", "Accept-Language": acceptLanguage },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NominatimResult[];
  return data.map((r) => ({ name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
}

interface NominatimReverseResult {
  display_name: string;
}

async function nominatimReverse(lat: number, lon: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Flux-TripPlanner/1.0 (contact@daolab.io)" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error("reverse geocode failed");
  const data = (await res.json()) as NominatimReverseResult;
  return data.display_name;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  if (!(await checkRateLimit(session.user.id, "geocode", GEOCODE_MAX_PER_HOUR))) {
    return NextResponse.json({ results: [] }, { status: 429 });
  }

  // Reverse geocode: ?reverse=1&lat=&lon=
  const reverse = req.nextUrl.searchParams.get("reverse");
  if (reverse === "1") {
    const latRaw = req.nextUrl.searchParams.get("lat");
    const lonRaw = req.nextUrl.searchParams.get("lon");
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ name: null }, { status: 400 });
    }
    try {
      const name = await nominatimReverse(lat, lon);
      return NextResponse.json({ name });
    } catch {
      return NextResponse.json({ name: null });
    }
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const acceptLanguage = req.headers.get("accept-language") ?? "en,ro,de,fr,hu";
  const bias = parseBias(req.nextUrl.searchParams);
  const cc = parseCountryCodes(req.nextUrl.searchParams);

  // Try providers in order of reliability/coverage; each is isolated so a failing
  // or blocked provider falls through to the next instead of returning empty.
  const providers: Array<() => Promise<GeocodeHit[]>> = [
    () => tomtomSearch(q, bias, cc),
    () => photonSearch(q, bias),
    () => nominatimSearch(q, acceptLanguage, bias, cc),
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
