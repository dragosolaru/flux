// Shared Upstash client.
//
// Two naming conventions reach us depending on how the database was attached:
//
//   * Upstash's own dashboard hands out UPSTASH_REDIS_REST_URL / _TOKEN, which
//     is what Redis.fromEnv() looks for.
//   * Vercel's Marketplace integration provisions the same Upstash database but
//     names the variables KV_REST_API_URL / KV_REST_API_TOKEN (alongside KV_URL
//     and REDIS_URL, which are the TCP form and not usable from the REST
//     client).
//
// Reading both means an integration-attached database works without hand-copying
// its credentials into a second pair of variables that would then drift when the
// database is rotated.

import { Redis } from "@upstash/redis";

function resolveConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** True when a REST-capable Redis is configured under either convention. */
export function isRedisConfigured(): boolean {
  return resolveConfig() !== null;
}

/** Which convention supplied the credentials — for diagnostics only. */
export function redisSource(): "upstash" | "vercel-kv" | "none" {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return "upstash";
  }
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return "vercel-kv";
  return "none";
}

const config = resolveConfig();

export const redis = config ? new Redis(config) : null;
