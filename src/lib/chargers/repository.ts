// Ingestion orchestrator + persistence. `ingestArea` is the cache-through entry
// point: fetch all sources for a tile, dedup against existing canonicals, UPSERT,
// and mark the tile fresh in Redis. `ensureAreaFresh` runs it only for stale tiles.

import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BBox } from "./types";
import type { ChargerCluster } from "./dedup";
import { fetchAllSources } from "./ingest";
import { clusterChargers } from "./dedup";
import { findInBBox } from "./query";
import { tilesForBBox, tileKey, type Tile } from "./tiles";
import { bulkCountryContaining, type BulkCountry } from "./countries";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

// Lazy-path tiles stay fresh for 7 days; the cron warms hot tiles more often.
const TILE_TTL_SECONDS = 7 * 24 * 60 * 60;

// Country-level freshness: a bulk-imported country skips lazy tile ingest for
// 48 hours so every tile within it does not re-ingest data already imported.
const COUNTRY_TTL_SECONDS = 48 * 60 * 60;

// Per-instance fallback used only when Redis is absent. Without it every map
// read treats every tile as stale and re-runs a full seven-source ingest, so a
// missing or briefly unreachable Redis turns each pan into seconds of latency
// and a burst of third-party calls. A serverless instance is short-lived and
// each keeps its own copy, so this is a damper, not a cache — Redis is still
// required in production.
const memoryFreshness = new Map<string, number>();
const MEMORY_TTL_MS = 10 * 60 * 1000;

function memoryFresh(key: string): boolean {
  const at = memoryFreshness.get(key);
  if (at === undefined) return false;
  if (Date.now() - at > MEMORY_TTL_MS) {
    memoryFreshness.delete(key);
    return false;
  }
  return true;
}

function markMemoryFresh(key: string): void {
  // Bound the map: an instance serving many areas must not grow without limit.
  if (memoryFreshness.size > 5_000) memoryFreshness.clear();
  memoryFreshness.set(key, Date.now());
}

function freshnessKey(tile: Tile): string {
  // Namespace is bumped whenever ingestion/dedup behaviour changes so cached
  // tiles re-ingest and pick up the new logic in one shot.
  //   v2: un-poison tiles cached fresh while every upsert failed (pre-020).
  //   v3: apply operator-aware same-site dedup (co-located different operators
  //       stay separate, e.g. a Tesla Supercharger next to an AC charger),
  //       add the TomTom source, and restore rows migration 021 may have
  //       collapsed by location cell regardless of operator.
  //   v4: batched hash-aware upserts (022) + country-level bulk freshness.
  //   v5: widened same-site radius to 40 m, operator-name containment, and the
  //       operator-conflict guard applied at every distance (034).
  return `chargers:tile:v5:${tileKey(tile)}`;
}

function countryKey(cc: BulkCountry): string {
  // Namespaced like the tile key so a bump invalidates country freshness in one
  // shot. This matters after any bulk deletion of chargers: a stale "fresh"
  // marker makes ensureAreaFresh short-circuit, and the map would serve an
  // empty country until the 48 h TTL expired instead of re-ingesting it.
  //   v2: same-site dedup rules widened (034) + safe to truncate and refill.
  return `chargers:country:v2:${cc}`;
}

async function markTileFresh(tile: Tile): Promise<void> {
  const key = freshnessKey(tile);
  if (!redis) {
    markMemoryFresh(key);
    return;
  }
  await redis.set(key, Date.now(), { ex: TILE_TTL_SECONDS });
}

export async function markCountryFresh(cc: BulkCountry): Promise<void> {
  if (!redis) return;
  await redis.set(countryKey(cc), Date.now(), { ex: COUNTRY_TTL_SECONDS });
}

/**
 * Whether a bulk country was imported recently enough to skip. Without Redis
 * there is no freshness record, so callers must treat every country as stale.
 */
export async function isCountryFresh(cc: BulkCountry): Promise<boolean> {
  if (!redis) return false;
  return (await redis.get(countryKey(cc))) !== null;
}

function computeClusterHash(c: ChargerCluster): string {
  // Connectors/sources are merged in arrival order, which varies between
  // ingests (parallel fetches interleave). Sort them for the hash only, so a
  // reordering doesn't defeat the unchanged-row skip in the batch RPC.
  const sortedConnectors = c.connectors
    .map((x) => JSON.stringify(x))
    .sort();
  const sortedSources = c.sources
    .map((s) => `${s.source}:${s.ref}`)
    .sort();
  const payload = JSON.stringify([
    c.lat.toFixed(6),
    c.lng.toFixed(6),
    c.name,
    c.operator,
    c.address.country,
    c.address,
    c.maxPowerKw,
    c.pricing,
    c.confidence,
    c.availability,
    sortedConnectors,
    sortedSources,
  ]);
  return createHash("sha1").update(payload).digest("hex");
}

const BATCH_SIZE = 200;

/**
 * Persist deduplicated clusters to the DB via batched RPC. Returns the total
 * count of rows processed across all successful chunks.
 */
export async function persistClusters(
  clusters: ChargerCluster[],
): Promise<{ upserted: number; error: string | null }> {
  const supabase = createSupabaseAdminClient();
  let total = 0;
  let firstError: string | null = null;

  for (let i = 0; i < clusters.length; i += BATCH_SIZE) {
    const chunk = clusters.slice(i, i + BATCH_SIZE);
    const payload = chunk.map((c) => ({
      id: c.matchedExistingId,
      lat: c.lat,
      lng: c.lng,
      name: c.name,
      operator: c.operator,
      operatorId: c.operatorId,
      country: c.address.country,
      address: c.address,
      maxPowerKw: c.maxPowerKw,
      pricing: c.pricing,
      confidence: c.confidence,
      availability: c.availability,
      connectors: c.connectors,
      sources: c.sources,
      hash: computeClusterHash(c),
    }));

    const { error } = await supabase.rpc("upsert_chargers_batch", {
      p_chargers: payload,
    });
    if (error) {
      console.error("[charger-repo] batch upsert failed:", error);
      // Keep the first message: ingest_runs used to record only "all upserts
      // failed", which cannot distinguish a constraint violation from a
      // connection drop.
      firstError ??= error.message;
    } else {
      total += chunk.length;
    }
  }

  return { upserted: total, error: firstError };
}

/**
 * Fetch → normalize → dedup → UPSERT all chargers within a bounding box, then
 * mark every covered tile fresh. Records an ingest_runs row for observability.
 * Safe to call concurrently; UPSERTs are idempotent on (source, source_ref).
 */
export async function ingestArea(bbox: BBox): Promise<{ upserted: number }> {
  const supabase = createSupabaseAdminClient();
  const tiles = tilesForBBox(bbox);
  const runLabel = `${bbox.minLat.toFixed(2)},${bbox.minLng.toFixed(2)}`;

  let raws;
  try {
    raws = await fetchAllSources(bbox);
  } catch (err) {
    await supabase.from("ingest_runs").insert({
      tile: runLabel,
      source: "all",
      status: "error",
      error: err instanceof Error ? err.message : "fetch failed",
      finished_at: new Date().toISOString(),
    });
    return { upserted: 0 };
  }

  const existing = await findInBBox({ bbox, limit: 500 });
  const clusters = clusterChargers(raws, existing);

  const { upserted, error: upsertError } = await persistClusters(clusters);

  // Only mark tiles fresh when the ingest actually persisted data (or the area
  // is legitimately empty). If we had clusters but every upsert failed, this is
  // a real failure — leave the tiles stale so the next request retries instead
  // of caching an empty area for the full TTL.
  const ingestFailed = clusters.length > 0 && upserted === 0;
  if (!ingestFailed) {
    await Promise.all(tiles.map(markTileFresh));
  }

  await supabase.from("ingest_runs").insert({
    tile: runLabel,
    source: "all",
    status: ingestFailed ? "error" : "ok",
    fetched: raws.length,
    upserted,
    error: ingestFailed ? (upsertError ?? "all upserts failed") : null,
    finished_at: new Date().toISOString(),
  });

  return { upserted };
}

/**
 * Ensure every tile covering the bbox is fresh, ingesting the stale ones. Called
 * by the read APIs before querying so a cold area is populated on first request.
 */
export async function ensureAreaFresh(bbox: BBox): Promise<void> {
  // Country-level shortcut: if the entire bbox falls inside a bulk-imported
  // country that was recently refreshed, skip tile-level ingest entirely.
  const cc = bulkCountryContaining(bbox);
  if (cc && redis && (await redis.get(countryKey(cc))) !== null) return;

  const tiles = tilesForBBox(bbox);
  const keys = tiles.map(freshnessKey);

  let values: (string | null)[];
  if (redis) {
    values = await redis.mget<(string | null)[]>(...keys);
  } else {
    values = keys.map((k) => (memoryFresh(k) ? "1" : null));
  }

  const staleTiles = tiles.filter((_, i) => values[i] === null);
  if (staleTiles.length === 0) return;

  // Ingest the whole requested bbox once (covers all stale tiles in one pass).
  await ingestArea(bbox);
}
