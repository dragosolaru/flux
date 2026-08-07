import { Ratelimit } from "@upstash/ratelimit";
import { redis as sharedRedis } from "@/lib/redis";

interface RateLimitEntry { count: number; windowStart: number }

// In-memory fallback — per-process, resets on cold start, NOT shared across
// Vercel instances. Used only when Upstash is not configured (e.g. local dev).
const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 3_600_000; // 1 hour

function checkInMemory(key: string, maxPerHour: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxPerHour) return false;
  entry.count++;
  return true;
}

// Upstash sliding-window limiter, shared across all serverless instances.
// One limiter per (bucket, max) pair so each bucket keeps its own quota.
const redis = sharedRedis;
const limiters = new Map<string, Ratelimit>();

function getLimiter(bucket: string, maxPerHour: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${bucket}:${maxPerHour}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxPerHour, "1 h"),
      prefix: `rl:${bucket}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/**
 * Returns true if the request is allowed, false if the limit is exceeded.
 * Uses Upstash Redis when configured (shared across instances), otherwise an
 * in-memory fallback. Async so callers must await.
 */
export async function checkRateLimit(
  identifier: string,
  bucket: string,
  maxPerHour: number,
): Promise<boolean> {
  const limiter = getLimiter(bucket, maxPerHour);
  if (limiter) {
    const { success } = await limiter.limit(identifier);
    return success;
  }
  return checkInMemory(`${identifier}:${bucket}`, maxPerHour);
}
