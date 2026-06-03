export interface ChargingStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  connectorCount: number;
  maxPowerKw: number | null;
  isOperational: boolean;
  town?: string;
}

// --- OpenChargeMap v3 POI shape (only the fields we use) ---

interface OcmConnection {
  PowerKW?: number | null;
}

interface OcmStatusType {
  IsOperational?: boolean | null;
}

interface OcmAddressInfo {
  Title?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
  Town?: string | null;
}

interface OcmPoi {
  ID?: number | null;
  AddressInfo?: OcmAddressInfo | null;
  Connections?: OcmConnection[] | null;
  StatusType?: OcmStatusType | null;
}

function isOcmPoi(value: unknown): value is OcmPoi {
  return typeof value === "object" && value !== null;
}

function mapOcmPoi(poi: OcmPoi): ChargingStation | null {
  const info = poi.AddressInfo;
  if (!info) return null;

  const lat = info.Latitude;
  const lng = info.Longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const connections = Array.isArray(poi.Connections) ? poi.Connections : [];
  const maxPowerKw = connections.reduce<number | null>((acc, c) => {
    const kw = typeof c.PowerKW === "number" ? c.PowerKW : null;
    if (kw === null) return acc;
    return acc === null ? kw : Math.max(acc, kw);
  }, null);

  return {
    id: String(poi.ID ?? `ocm-${lat}-${lng}`),
    name: info.Title ?? "Charging Station",
    lat,
    lng,
    connectorCount: connections.length,
    maxPowerKw,
    isOperational: poi.StatusType?.IsOperational ?? true,
    town: info.Town ?? undefined,
  };
}

async function fetchOcmStations(
  lat: number,
  lng: number,
  radiusKm: number,
  max: number,
): Promise<ChargingStation[]> {
  const url = new URL("https://api.openchargemap.io/v3/poi/");
  url.searchParams.set("output", "json");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("distance", String(radiusKm));
  url.searchParams.set("distanceunit", "km");
  url.searchParams.set("maxresults", String(max));
  url.searchParams.set("compact", "true");
  url.searchParams.set("verbose", "false");

  const apiKey = process.env.OPEN_CHARGE_MAP_API_KEY;
  if (apiKey) url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];

  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];

  const stations: ChargingStation[] = [];
  for (const item of raw) {
    if (!isOcmPoi(item)) continue;
    const station = mapOcmPoi(item);
    if (station) stations.push(station);
  }
  return stations;
}

// --- Overpass / OpenStreetMap shape (only the fields we use) ---

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// OSM maxpower is messy: "22 kW", "50 kW", "150000" (watts), "22000 W".
// Honor an explicit unit; otherwise treat large bare numbers as watts.
function parseMaxPowerKw(tags: Record<string, string>): number | null {
  const raw =
    tags["maxpower"] ??
    tags["socket:type2:output"] ??
    tags["socket:ccs:output"] ??
    tags["socket:chademo:output"] ??
    null;
  if (!raw) return null;

  const match = /(\d+(?:\.\d+)?)\s*(kW|W)?/i.exec(raw);
  if (!match) return null;

  const val = parseFloat(match[1]);
  if (!isFinite(val)) return null;

  const unit = match[2]?.toLowerCase();
  if (unit === "kw") return val;
  if (unit === "w") return val / 1000;
  return val > 1000 ? val / 1000 : val;
}

async function fetchOverpassStations(
  lat: number,
  lng: number,
  radiusKm: number,
  max: number,
): Promise<ChargingStation[]> {
  const radiusM = Math.round(radiusKm * 1000);
  const query = `[out:json][timeout:20];(node["amenity"="charging_station"](around:${radiusM},${lat},${lng});way["amenity"="charging_station"](around:${radiusM},${lat},${lng}););out body center ${max};`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(22000),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { elements?: OverpassElement[] };
  const elements = data.elements ?? [];

  return elements.flatMap((el): ChargingStation[] => {
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (typeof elLat !== "number" || typeof elLng !== "number") return [];

    const tags = el.tags ?? {};
    const capacity = parseInt(tags["capacity"] ?? "1", 10);
    return [
      {
        id: `osm-${el.type}-${el.id}`,
        name: tags["name"] ?? tags["operator"] ?? "Charging Station",
        lat: elLat,
        lng: elLng,
        connectorCount: isFinite(capacity) && capacity > 0 ? capacity : 1,
        maxPowerKw: parseMaxPowerKw(tags),
        isOperational: tags["operational_status"] !== "closed",
        town: tags["addr:city"] ?? tags["addr:suburb"] ?? undefined,
      },
    ];
  });
}

// De-dup by rounding lat/lng to ~4 decimals (~11m). On a collision keep the
// richer entry: more connectors wins, and a non-null maxPowerKw is preserved.
function dedupeKey(s: ChargingStation): string {
  return `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
}

function mergeStations(a: ChargingStation, b: ChargingStation): ChargingStation {
  const richer = b.connectorCount > a.connectorCount ? b : a;
  return {
    ...richer,
    maxPowerKw: a.maxPowerKw ?? b.maxPowerKw,
    town: richer.town ?? a.town ?? b.town,
  };
}

/**
 * Query OpenChargeMap and Overpass in parallel, then merge + de-duplicate.
 * Returns up to `maxResults` stations. Never throws — a failed source is
 * simply ignored. Returns an empty array only when both sources yield nothing.
 */
export async function fetchLiveStations(
  lat: number,
  lng: number,
  radiusKm: number,
  maxResults: number,
): Promise<ChargingStation[]> {
  const [ocm, overpass] = await Promise.allSettled([
    fetchOcmStations(lat, lng, radiusKm, maxResults),
    fetchOverpassStations(lat, lng, radiusKm, maxResults),
  ]);

  const ocmStations = ocm.status === "fulfilled" ? ocm.value : [];
  const overpassStations = overpass.status === "fulfilled" ? overpass.value : [];

  const byKey = new Map<string, ChargingStation>();
  // OCM first so its (usually richer) data seeds each location.
  for (const station of [...ocmStations, ...overpassStations]) {
    const key = dedupeKey(station);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeStations(existing, station) : station);
  }

  return Array.from(byKey.values()).slice(0, maxResults);
}
