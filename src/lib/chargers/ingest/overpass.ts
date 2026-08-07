import type {
  BBox,
  ChargerConnector,
  RawCharger,
  SourceConnector,
} from "../types";
import { canonicalConnectorType, parsePowerKw } from "../normalize";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

// The main Overpass instance is often queued/slow, so we race several mirrors
// and take whichever returns a usable payload first within the budget.
const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

function parseCount(value: string | undefined): number {
  if (!value) return 1;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function buildConnectors(tags: Record<string, string>): ChargerConnector[] {
  const socketTypes = new Set<string>();
  for (const key of Object.keys(tags)) {
    const match = /^socket:([^:]+)$/.exec(key);
    if (match) socketTypes.add(match[1]!);
  }

  if (socketTypes.size === 0) {
    return [
      {
        type: "other",
        powerKw: parsePowerKw(tags["maxpower"] ?? null),
        count: parseCount(tags["capacity"]),
      },
    ];
  }

  const connectors: ChargerConnector[] = [];
  for (const socket of socketTypes) {
    connectors.push({
      type: canonicalConnectorType(socket),
      powerKw: parsePowerKw(tags[`socket:${socket}:output`] ?? null),
      count: parseCount(tags[`socket:${socket}`] ?? tags["capacity"]),
    });
  }
  return connectors;
}

export function mapOverpassElement(el: OverpassElement): RawCharger | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const tags = el.tags ?? {};

  return {
    source: "osm",
    sourceRef: `${el.type}/${el.id}`,
    lat,
    lng,
    name: tags["name"] ?? null,
    operator: tags["operator"] ?? tags["network"] ?? null,
    address: {
      street:
        [tags["addr:street"], tags["addr:housenumber"]]
          .filter(Boolean)
          .join(" ") || null,
      city: tags["addr:city"] ?? tags["addr:suburb"] ?? null,
      region: tags["addr:state"] ?? null,
      country: tags["addr:country"] ?? null,
      postcode: tags["addr:postcode"] ?? null,
    },
    connectors: buildConnectors(tags),
    pricing: null,
  };
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  const box = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
  const query = `[out:json][timeout:25];(node["amenity"="charging_station"](${box});way["amenity"="charging_station"](${box}););out body center 2000;`;
  const body = `data=${encodeURIComponent(query)}`;

  const attempts = OVERPASS_MIRRORS.map(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Flux-Chargers/1.0",
      },
      body,
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data = (await res.json()) as OverpassResponse;
    if (!data.elements) throw new Error("overpass no elements");
    return data.elements;
  });

  let elements: OverpassElement[];
  try {
    elements = await Promise.any(attempts);
  } catch {
    return [];
  }

  const out: RawCharger[] = [];
  for (const el of elements) {
    const mapped = mapOverpassElement(el);
    if (mapped) out.push(mapped);
  }
  return out;
}

export const overpassConnector: SourceConnector = {
  id: "osm",
  fetchTile,
};
