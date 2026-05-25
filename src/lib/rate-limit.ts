interface RateLimitEntry { count: number; windowStart: number }

// Module-level store — resets on server restart, not shared across Vercel instances.
// Acceptable for MVP; upgrade to Upstash Redis for production multi-instance deployments.
const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 3_600_000; // 1 hour

export function checkRateLimit(userId: string, bucket: string, maxPerHour: number): boolean {
  const key = `${userId}:${bucket}`;
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
