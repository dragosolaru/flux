// Ingestion orchestrator + persistence. `ingestArea` is the cache-through entry
// point: fetch all sources for a tile, dedup against existing canonicals, UPSERT,
// and mark the tile fresh in Redis. `ensureAreaFresh` runs it only for stale tiles.

import { Redis } from "@upstash/redis";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BBox, Charger } from "./types";
import { fetchAllSources } from "./ingest";
import { clusterChargers } from "./dedup";
import { findInBBox } from "./query";
import { tilesForBBox, tileKey, type Tile } from "./tiles";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

// Lazy-path tiles stay fresh for 7 days; the cron warms hot tiles more often.
const TILE_TTL_SECONDS = 7 * 24 * 60 * 60;

function freshnessKey(tile: Tile): string {
  // v2: the v1 namespace was poisoned — early ingest runs marked tiles fresh
  // even when every upsert_charger RPC failed (the p_availability param did not
  // exist before migration 020), leaving areas permanently empty for the 7-day
  // TTL. Bumping the namespace invalidates those stale markers in one shot.
  return `chargers:tile:v2:${tileKey(tile)}`;
}

async function isTileFresh(tile: Tile): Promise<boolean> {
  if (!redis) return false;
  const v = await redis.get(freshnessKey(tile));
  return v !== null;
}

async function markTileFresh(tile: Tile): Promise<void> {
  if (!redis) return;
  await redis.set(freshnessKey(tile), Date.now(), { ex: TILE_TTL_SECONDS });
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

  const existing: Charger[] = await findInBBox({ bbox, limit: 500 });
  const clusters = clusterChargers(raws, existing);

  const results = await Promise.all(
    clusters.map((c) =>
      supabase.rpc("upsert_charger", {
        p_id: c.matchedExistingId,
        p_lat: c.lat,
        p_lng: c.lng,
        p_name: c.name,
        p_operator: c.operator,
        p_operator_id: c.operatorId,
        p_country: c.address.country,
        p_address: c.address,
        p_max_power_kw: c.maxPowerKw,
        p_pricing: c.pricing,
        p_confidence: c.confidence,
        p_availability: c.availability,
        p_connectors: c.connectors,
        p_sources: c.sources,
      }),
    ),
  );
  const upserted = results.filter((r) => !r.error).length;

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
    error: ingestFailed ? "all upserts failed" : null,
    finished_at: new Date().toISOString(),
  });

  return { upserted };
}

/**
 * Ensure every tile covering the bbox is fresh, ingesting the stale ones. Called
 * by the read APIs before querying so a cold area is populated on first request.
 */
export async function ensureAreaFresh(bbox: BBox): Promise<void> {
  const tiles = tilesForBBox(bbox);
  const staleness = await Promise.all(tiles.map(isTileFresh));
  const staleTiles = tiles.filter((_, i) => !staleness[i]);
  if (staleTiles.length === 0) return;

  // Ingest the whole requested bbox once (covers all stale tiles in one pass).
  await ingestArea(bbox);
}
