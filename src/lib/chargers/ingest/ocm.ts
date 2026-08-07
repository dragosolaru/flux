import type {
  BBox,
  ChargerAvailability,
  ChargerConnector,
  RawCharger,
  SourceConnector,
} from "../types";
import { STALE_AFTER_DAYS } from "../types";
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

interface OcmStatusType {
  IsOperational?: boolean | null;
}

// OCM StatusTypeID reference values (when the verbose StatusType object is
// absent under compact mode). 50/75/150 = operational variants; 100/200/30 =
// not operational; 0/null = unknown.
const OCM_OPERATIONAL_STATUS_IDS = new Set<number>([50, 75, 150]);
const OCM_NOT_OPERATIONAL_STATUS_IDS = new Set<number>([30, 100, 200, 210]);

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
  StatusType?: OcmStatusType | null;
  StatusTypeID?: number | null;
  DateLastStatusUpdate?: string | null;
  DateLastVerified?: string | null;
}

/**
 * Derive operational status from OCM's StatusType / StatusTypeID, then downgrade
 * a still-operational station to "stale" if it hasn't been verified recently.
 */
function deriveAvailability(poi: OcmPoi): ChargerAvailability {
  let operational: boolean | null = null;

  if (typeof poi.StatusType?.IsOperational === "boolean") {
    operational = poi.StatusType.IsOperational;
  } else if (typeof poi.StatusTypeID === "number") {
    if (OCM_OPERATIONAL_STATUS_IDS.has(poi.StatusTypeID)) operational = true;
    else if (OCM_NOT_OPERATIONAL_STATUS_IDS.has(poi.StatusTypeID)) operational = false;
  }

  if (operational === false) return "offline";
  if (operational !== true) return "unknown";

  const verified = poi.DateLastVerified ?? poi.DateLastStatusUpdate;
  if (verified) {
    const ts = Date.parse(verified);
    if (Number.isFinite(ts)) {
      const ageDays = (Date.now() - ts) / 86_400_000;
      if (ageDays > STALE_AFTER_DAYS) return "stale";
    }
  }
  return "operational";
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
    availability: deriveAvailability(poi),
  };
}

async function fetchTile(bbox: BBox): Promise<RawCharger[]> {
  try {
    const url = new URL("https://api.openchargemap.io/v3/poi/");
    url.searchParams.set("output", "json");
    // compact strips null fields; verbose must stay ON because it is what
    // expands the reference objects. With verbose=false OCM returns
    // OperatorID/CountryID integers instead of OperatorInfo/Country objects,
    // and mapOcmPoi reads the objects — so every row landed with a null
    // operator and null country.
    url.searchParams.set("compact", "true");
    url.searchParams.set("verbose", "true");
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
    if (!res.ok) {
      console.error(`[ocm] tile fetch ${res.status}`);
      return [];
    }

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

/**
 * Full-country fetch: queries OCM /poi by countrycode with optional modifiedsince
 * for incremental updates. maxresults=5000. Returns [] on any error.
 */
export async function fetchCountryOcm(
  countryCode: string,
  modifiedSince?: Date,
): Promise<RawCharger[]> {
  try {
    const url = new URL("https://api.openchargemap.io/v3/poi/");
    url.searchParams.set("output", "json");
    // compact strips null fields; verbose must stay ON because it is what
    // expands the reference objects. With verbose=false OCM returns
    // OperatorID/CountryID integers instead of OperatorInfo/Country objects,
    // and mapOcmPoi reads the objects — so every row landed with a null
    // operator and null country.
    url.searchParams.set("compact", "true");
    url.searchParams.set("verbose", "true");
    url.searchParams.set("maxresults", "5000");
    url.searchParams.set("countrycode", countryCode);
    if (modifiedSince) {
      url.searchParams.set("modifiedsince", modifiedSince.toISOString());
    }

    const apiKey = process.env.OPEN_CHARGE_MAP_API_KEY;
    if (apiKey) url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.error(`[ocm] country fetch ${res.status}`);
      return [];
    }

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
