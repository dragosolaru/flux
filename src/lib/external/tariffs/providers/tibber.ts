import type { HourlyPrice, TariffProvider } from "../types";

const TIBBER_API_URL = "https://api.tibber.com/v1-beta/gql";

const TIBBER_QUERY = `{
  viewer {
    homes {
      currentSubscription {
        priceInfo {
          today {
            total
            startsAt
          }
          tomorrow {
            total
            startsAt
          }
        }
      }
    }
  }
}`;

interface TibberPriceEntry {
  total: number;
  startsAt: string; // ISO 8601 string
}

interface TibberResponse {
  data?: {
    viewer?: {
      homes?: Array<{
        currentSubscription?: {
          priceInfo?: {
            today?: TibberPriceEntry[];
            tomorrow?: TibberPriceEntry[];
          };
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

interface CacheEntry {
  prices: HourlyPrice[];
  fetchedAt: number; // Date.now()
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache keyed by calendar date string "YYYY-MM-DD"
const priceCache = new Map<string, CacheEntry>();

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

async function fetchTibberPrices(date: Date): Promise<HourlyPrice[]> {
  const token = process.env.TIBBER_TOKEN;
  if (!token) {
    throw new Error(
      "TIBBER_TOKEN environment variable is not set. " +
        "Get your personal access token at https://developer.tibber.com/settings/access-token"
    );
  }

  const response = await fetch(TIBBER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: TIBBER_QUERY }),
  });

  if (!response.ok) {
    throw new Error(
      `Tibber API returned HTTP ${response.status}: ${response.statusText}`
    );
  }

  const json: TibberResponse = await response.json();

  if (json.errors?.length) {
    throw new Error(
      `Tibber GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }

  const homes = json.data?.viewer?.homes ?? [];
  if (homes.length === 0) {
    throw new Error("Tibber: no homes found for this account");
  }

  const priceInfo = homes[0]?.currentSubscription?.priceInfo;
  if (!priceInfo) {
    throw new Error("Tibber: no active subscription found for first home");
  }

  // Determine which day's data to use based on the requested date
  const requestedKey = toDateKey(date);
  const todayKey = toDateKey(new Date());
  const tomorrowKey = toDateKey(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );

  let entries: TibberPriceEntry[] | undefined;
  if (requestedKey === tomorrowKey && priceInfo.tomorrow?.length) {
    entries = priceInfo.tomorrow;
  } else {
    entries = priceInfo.today;
  }

  if (!entries?.length) {
    throw new Error(
      `Tibber: no price data available for ${requestedKey} (requested date vs today=${todayKey})`
    );
  }

  // Map to HourlyPrice — startsAt is an ISO timestamp; extract the local hour
  return entries.map((entry) => {
    const hour = new Date(entry.startsAt).getHours();
    return {
      hour,
      priceEurKwh: Math.round(entry.total * 1000) / 1000,
    };
  });
}

async function getCachedOrFetch(date: Date): Promise<HourlyPrice[]> {
  const key = toDateKey(date);
  const cached = priceCache.get(key);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.prices;
  }

  const prices = await fetchTibberPrices(date);
  priceCache.set(key, { prices, fetchedAt: now });
  return prices;
}

export const tibber: TariffProvider = {
  id: "tibber",
  displayName: "Tibber",
  getTodayPrices: (date = new Date()) => {
    // TariffProvider.getTodayPrices is synchronous per the interface.
    // We kick off the async fetch and return stale/empty data synchronously
    // on first call; subsequent calls within the cache TTL return cached data.
    // To stay interface-compliant while supporting async, we use a
    // synchronous cache read with an async background refresh.
    const key = toDateKey(date);
    const cached = priceCache.get(key);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.prices;
    }

    // Trigger background fetch — callers should await the promise returned
    // by a wrapper if they need fresh data, but we stay interface-compatible.
    getCachedOrFetch(date).catch((err) => {
      console.error("[Tibber] Failed to fetch prices:", err);
    });

    // Return stale cache if available, otherwise empty fallback
    if (cached) {
      return cached.prices;
    }

    // No cache yet — return zero prices for all 24 hours as a safe fallback
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      priceEurKwh: 0,
    }));
  },
};

/**
 * Async variant that callers can use to pre-warm the cache.
 * Call this from a server component or API route before rendering.
 */
export async function tibberPreload(date = new Date()): Promise<void> {
  await getCachedOrFetch(date);
}
