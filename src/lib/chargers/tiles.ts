// Tile-grid helpers: quantize bounding boxes to a stable ~0.1° grid so ingestion
// freshness can be tracked per tile (Redis keys) and overlapping requests reuse
// the same ingestion work. See the charger data platform spec.

import type { BBox } from "./types";

/** Grid cell size in degrees (~11km lat). Stable across the platform. */
export const TILE_SIZE_DEG = 0.1;

export interface Tile {
  /** Integer grid indices. */
  x: number; // floor(lng / TILE_SIZE_DEG)
  y: number; // floor(lat / TILE_SIZE_DEG)
}

/** Stable string id for a tile, used as the Redis freshness key suffix. */
export function tileKey(tile: Tile): string {
  return `${tile.x}:${tile.y}`;
}

/** The tile containing a single point. */
export function tileForPoint(lat: number, lng: number): Tile {
  return {
    x: Math.floor(lng / TILE_SIZE_DEG),
    y: Math.floor(lat / TILE_SIZE_DEG),
  };
}

/** The bounding box covered by a tile. */
export function tileBBox(tile: Tile): BBox {
  return {
    minLng: tile.x * TILE_SIZE_DEG,
    minLat: tile.y * TILE_SIZE_DEG,
    maxLng: (tile.x + 1) * TILE_SIZE_DEG,
    maxLat: (tile.y + 1) * TILE_SIZE_DEG,
  };
}

/**
 * All tiles overlapping a bounding box. Capped to avoid pathological requests
 * (a huge bbox would otherwise expand to thousands of tiles).
 */
export function tilesForBBox(bbox: BBox, maxTiles = 64): Tile[] {
  const minX = Math.floor(bbox.minLng / TILE_SIZE_DEG);
  const maxX = Math.floor(bbox.maxLng / TILE_SIZE_DEG);
  const minY = Math.floor(bbox.minLat / TILE_SIZE_DEG);
  const maxY = Math.floor(bbox.maxLat / TILE_SIZE_DEG);

  const tiles: Tile[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      tiles.push({ x, y });
      if (tiles.length >= maxTiles) return tiles;
    }
  }
  return tiles;
}

/** Expand a center+radius (km) into a covering bounding box. */
export function radiusToBBox(lat: number, lng: number, radiusKm: number): BBox {
  const latDelta = radiusKm / 111; // ~111km per degree latitude
  const lngDelta = radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}
