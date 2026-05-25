interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 3_600_000; // 1 hour

/**
 * Returns true if the request is allowed, false if rate limited.
 * Uses an in-memory sliding window — not shared across Vercel instances.
 * For a production multi-instance deployment, replace with Redis or Upstash.
 */
export function checkRateLimit(userId: string, bucket: string, maxPerHour: number): boolean {
  const key = `${userId}:${bucket}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxPerHour) {
    return false;
  }

  entry.count++;
  return true;
}
