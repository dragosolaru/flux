import type {
  BBox,
  ChargerConnector,
  RawCharger,
  SourceConnector,
} from "../types";
import { canonicalConnectorType, parsePowerKw } from "../normalize";

interface OcmConnectionType {
  ID?: number | null;
  Title?: string | null;
}

interface OcmConnection {
  ConnectionType?: OcmConnectionType | null;
  ConnectionTypeID?: number | null;
  PowerKW?: number | null;
  Quantity?: number | null;
}

interface OcmOperatorInfo {
  Title?: string | null;
}

interface OcmAddressInfo {
  Title?: string | null;
  AddressLine1?: string | null;
  Town?: string | null;
  StateOrProvince?: string | null;
  Country?: { ISOCode?: string | null } | null;
  Postcode?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
}

interface OcmPoi {
  ID?: number | null;
  AddressInfo?: OcmAddressInfo | null;
  OperatorInfo?: OcmOperatorInfo | null;
  Connections?: OcmConnection[] | null;
}

function isOcmPoi(value: unknown): value is OcmPoi {
  return typeof value === "object" && value !== null;
}

function mapConnection(conn: OcmConnection): ChargerConnector {
  const typeInput = conn.ConnectionType?.Title ?? conn.ConnectionTypeID ?? "";
  const count =
    typeof conn.Quantity === "number" && conn.Quantity > 0 ? conn.Quantity : 1;
  return {
    type: canonicalConnectorType(typeInput),
    powerKw: parsePowerKw(conn.PowerKW),
    count,
  };
}

export function mapOcmPoi(poi: OcmPoi): RawCharger | null {
  const info = poi.AddressInfo;
  if (!info) return null;

  const lat = info.Latitude;
  const lng = info.Longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (typeof poi.ID !== "number") return null;

  const connections = Array.isArray(poi.Connections) ? poi.Connections : [];

  return {
    source: "ocm",
    sourceRef: String(poi.ID),
    lat,
    lng,
    name: info.Title ?? null,
    operator: poi.OperatorInfo?.Title ?? null,
    address: {
      street: info.AddressLine1 ?? null,
      city: info.Town ?? null,
      region: info.StateOrProvince ?? null,
      country: info.Country?.ISOCode ?? null,
      postcode: info.Postcode ?? null,
    },
    connectors: connections.map(mapConnection),
    pricing: null,
  };
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  try {
    const url = new URL("https://api.openchargemap.io/v3/poi/");
    url.searchParams.set("output", "json");
    url.searchParams.set("compact", "true");
    url.searchParams.set("verbose", "false");
    url.searchParams.set("maxresults", "2000");
    // OCM boundingbox: (lat1,lng1),(lat2,lng2).
    url.searchParams.set(
      "boundingbox",
      `(${bbox.minLat},${bbox.minLng}),(${bbox.maxLat},${bbox.maxLng})`,
    );

    const apiKey = process.env.OPEN_CHARGE_MAP_API_KEY;
    if (apiKey) url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];

    const out: RawCharger[] = [];
    for (const item of data) {
      if (!isOcmPoi(item)) continue;
      const mapped = mapOcmPoi(item);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch {
    return [];
  }
}

export const ocmConnector: SourceConnector = {
  id: "ocm",
  fetchTile,
};
