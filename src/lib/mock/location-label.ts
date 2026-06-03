// Returns a human-readable label for a lat/lng from mock scenarios.
// Falls back to "lat, lng" if no city matches within ~0.5 deg.

interface KnownLocation {
  name: string;
  lat: number;
  lng: number;
}

const KNOWN_LOCATIONS: KnownLocation[] = [
  // commuter scenario — Prague
  { name: "Prague", lat: 50.0755, lng: 14.4378 },
  { name: "Prague", lat: 50.087, lng: 14.4213 },
  // road-trip scenario
  { name: "Frankfurt", lat: 50.1109, lng: 8.6821 },
  { name: "Autobahn Stop", lat: 48.77, lng: 10.32 },
  { name: "Munich", lat: 48.1351, lng: 11.582 },
  // weekend-errands scenario — Vienna
  { name: "Vienna", lat: 48.2082, lng: 16.3738 },
  { name: "Vienna", lat: 48.215, lng: 16.36 },
  { name: "Vienna", lat: 48.2, lng: 16.39 },
  { name: "Vienna", lat: 48.212, lng: 16.365 },
  // vacation scenario
  { name: "Bucharest", lat: 44.4268, lng: 26.1025 },
  { name: "Brașov", lat: 45.6579, lng: 25.6012 },
  { name: "Sinaia", lat: 45.3585, lng: 25.5455 },
];

const THRESHOLD = 0.5;

export function mockLocationLabel(
  lat: number | null | undefined,
  lng: number | null | undefined
): string {
  if (lat == null || lng == null) return "—";

  let bestName: string | null = null;
  let bestDist = Infinity;

  for (const loc of KNOWN_LOCATIONS) {
    const dist = Math.sqrt(
      (lat - loc.lat) ** 2 + (lng - loc.lng) ** 2
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestName = loc.name;
    }
  }

  if (bestName !== null && bestDist <= THRESHOLD) {
    return bestName;
  }

  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}
