// Charger data platform (spec #1, M3): typed PostGIS read layer.
// Wraps the RPC functions in supabase/migrations/018_charger_queries.sql.
// Charger tables are shared reference data — read via the admin client.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  BBox,
  Charger,
  ChargerAddress,
  ChargerConnector,
  ChargerPricing,
  ChargerSourceId,
  ChargerSourceRef,
  ConnectorType,
} from "./types";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export interface NearbyParams {
  lat: number;
  lng: number;
  radiusKm: number;
  minKw?: number;
  connector?: ConnectorType;
  minConfidence?: number;
  limit?: number;
}

export interface BBoxParams {
  bbox: BBox;
  minKw?: number;
  connector?: ConnectorType;
  minConfidence?: number;
  limit?: number;
}

export interface SearchParams {
  q: string;
  country?: string;
  limit?: number;
}

const CONNECTOR_TYPES: ReadonlySet<string> = new Set<ConnectorType>([
  "ccs2",
  "ccs1",
  "chademo",
  "type2",
  "type1",
  "tesla",
  "schuko",
  "other",
]);

const SOURCE_IDS: ReadonlySet<string> = new Set<ChargerSourceId>(["ocm", "osm", "chargeprice"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toConnectorType(value: unknown): ConnectorType {
  return typeof value === "string" && CONNECTOR_TYPES.has(value) ? (value as ConnectorType) : "other";
}

function mapAddress(value: unknown): ChargerAddress {
  const a = isRecord(value) ? value : {};
  return {
    street: asString(a.street),
    city: asString(a.city),
    region: asString(a.region),
    country: asString(a.country),
    postcode: asString(a.postcode),
  };
}

function mapConnectors(value: unknown): ChargerConnector[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((c) => ({
    type: toConnectorType(c.type),
    powerKw: asNumber(c.powerKw),
    count: asNumber(c.count) ?? 1,
  }));
}

function mapSources(value: unknown): ChargerSourceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: ChargerSourceRef[] = [];
  for (const s of value) {
    if (!isRecord(s)) continue;
    const source = asString(s.source);
    const ref = asString(s.ref);
    if (source === null || ref === null || !SOURCE_IDS.has(source)) continue;
    refs.push({ source: source as ChargerSourceId, ref });
  }
  return refs;
}

function mapPricing(value: unknown): ChargerPricing | null {
  if (!isRecord(value)) return null;
  const perKwh = asNumber(value.perKwh);
  const currency = asString(value.currency);
  const source = asString(value.source);
  if (perKwh === null || currency === null || source === null) return null;
  return { perKwh, currency, source };
}

/**
 * Pure mapper from an RPC result row to a {@link Charger}. Guards every field
 * so a malformed/partial row never produces an invalid Charger. Kept pure and
 * exported so it is unit-testable without a DB.
 */
export function rowToCharger(row: unknown): Charger {
  const r = isRecord(row) ? row : {};
  return {
    id: asString(r.id) ?? "",
    lat: asNumber(r.lat) ?? 0,
    lng: asNumber(r.lng) ?? 0,
    name: asString(r.name),
    operator: asString(r.operator),
    operatorId: asString(r.operator_id),
    address: mapAddress(r.address),
    connectors: mapConnectors(r.connectors),
    maxPowerKw: asNumber(r.max_power_kw),
    pricing: mapPricing(r.pricing),
    availability: "unknown",
    confidence: asNumber(r.confidence) ?? 0,
    sources: mapSources(r.sources),
    lastSeenAt: asString(r.last_seen_at) ?? "",
  };
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
}

function mapRows(data: unknown): Charger[] {
  return Array.isArray(data) ? data.map(rowToCharger) : [];
}

export async function findNearby(p: NearbyParams): Promise<Charger[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.rpc("chargers_nearby", {
    p_lat: p.lat,
    p_lng: p.lng,
    p_radius_m: p.radiusKm * 1000,
    p_min_kw: p.minKw ?? null,
    p_connector: p.connector ?? null,
    p_min_confidence: p.minConfidence ?? 0,
    p_limit: clampLimit(p.limit),
  });
  return mapRows(data);
}

export async function findInBBox(p: BBoxParams): Promise<Charger[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.rpc("chargers_in_bbox", {
    p_min_lng: p.bbox.minLng,
    p_min_lat: p.bbox.minLat,
    p_max_lng: p.bbox.maxLng,
    p_max_lat: p.bbox.maxLat,
    p_min_kw: p.minKw ?? null,
    p_connector: p.connector ?? null,
    p_min_confidence: p.minConfidence ?? 0,
    p_limit: clampLimit(p.limit),
  });
  return mapRows(data);
}

export async function searchChargers(p: SearchParams): Promise<Charger[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.rpc("chargers_search", {
    p_q: p.q,
    p_country: p.country ?? null,
    p_limit: clampLimit(p.limit),
  });
  return mapRows(data);
}

export async function getCharger(id: string): Promise<Charger | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.rpc("charger_by_id", { p_id: id });
  const rows = mapRows(data);
  return rows[0] ?? null;
}
