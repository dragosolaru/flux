// Charger data platform — unified domain types shared by ingestion, storage,
// query, and API layers. See docs/superpowers/specs/2026-06-03-charger-data-platform-design.md

export type ConnectorType =
  | "ccs2"
  | "ccs1"
  | "chademo"
  | "type2"
  | "type1"
  | "tesla"
  | "schuko"
  | "other";

export type ChargerSourceId = "ocm" | "osm" | "chargeprice" | "bnetza" | "ndw" | "tomtom";

/**
 * Operational status. `operational`/`offline` come from a source that reports
 * live-ish status (OCM `StatusType.IsOperational`); `stale` means it was
 * operational but not verified recently (> {@link STALE_AFTER_DAYS} days);
 * `unknown` means no status signal at all.
 */
export type ChargerAvailability = "operational" | "offline" | "stale" | "unknown";

export const STALE_AFTER_DAYS = 90;

export interface ChargerAddress {
  street: string | null;
  city: string | null;
  region: string | null;
  country: string | null; // ISO 3166-1 alpha-2 where known
  postcode: string | null;
}

export interface ChargerConnector {
  type: ConnectorType;
  powerKw: number | null;
  count: number;
}

export interface ChargerPricing {
  perKwh: number;
  currency: string;
  source: string;
}

export interface ChargerSourceRef {
  source: ChargerSourceId;
  ref: string;
}

/** Canonical, deduplicated charger as served by the query APIs. */
export interface Charger {
  id: string;
  lat: number;
  lng: number;
  name: string | null;
  operator: string | null;
  operatorId: string | null; // normalized slug, e.g. "ionity"
  address: ChargerAddress;
  connectors: ChargerConnector[];
  maxPowerKw: number | null;
  pricing: ChargerPricing | null;
  availability: ChargerAvailability;
  confidence: number; // 0..1
  sources: ChargerSourceRef[];
  lastSeenAt: string;
}

/**
 * Partially-normalized charger emitted by a single source connector. The
 * normalizer maps each source's raw payload into this common shape; dedup then
 * merges RawChargers into canonical {@link Charger} rows.
 */
export interface RawCharger {
  source: ChargerSourceId;
  sourceRef: string;
  lat: number;
  lng: number;
  name: string | null;
  operator: string | null;
  address: ChargerAddress;
  connectors: ChargerConnector[];
  pricing: ChargerPricing | null;
  // Optional: only sources that report status set this (OCM). Defaults to
  // "unknown" during dedup when absent, so other connectors need not set it.
  availability?: ChargerAvailability;
}

/** Geographic bounding box (WGS84). */
export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** A source connector fetches all chargers within a bounding box. */
export interface SourceConnector {
  id: ChargerSourceId;
  fetchTile(bbox: BBox): Promise<RawCharger[]>;
}
