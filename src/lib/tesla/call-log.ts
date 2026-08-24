import { redis } from "@/lib/redis";

/**
 * A count of what we actually sent to Tesla, in hourly buckets.
 *
 * This exists because "the app does not keep the car awake" is not a claim code
 * can make credibly about itself. Every guard in the client — an interval that
 * is off, a screen that passes `poll: false` — is an assertion. This is a
 * measurement, taken at the last point before the request leaves for Tesla, so
 * it counts what happened rather than what was intended.
 *
 * `wake` is the one that costs battery: it is an explicit POST that pulls a
 * sleeping car out of sleep. `read` is a vehicle_data call, which is free while
 * the car is awake and refused (rather than escalated to a wake) while it is
 * asleep — see fetchVehicleData.
 */
export type TeslaCallKind = "read" | "wake" | "command";

const TTL_S = 48 * 3600;

function bucketKey(kind: TeslaCallKind, at: Date): string {
  // UTC hour. Local time would make the buckets shift under a DST change and
  // the 24-hour window silently gain or lose an hour.
  const stamp = at.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return `tesla:calls:${kind}:${stamp}`;
}

/**
 * Never throws and never blocks the caller: a counter that can break the thing
 * it measures is worse than no counter.
 */
export async function recordTeslaCall(kind: TeslaCallKind, at = new Date()): Promise<void> {
  if (!redis) return;
  const key = bucketKey(kind, at);
  try {
    await redis.incr(key);
    await redis.expire(key, TTL_S);
  } catch {
    // Counting is diagnostics. Losing a count must never fail a command.
  }
}

export interface TeslaCallCounts {
  /** False when no Redis is configured — the panel must say so, not show zeros. */
  available: boolean;
  read: number;
  wake: number;
  command: number;
  /** Per-hour totals, oldest first, for the last 24 hours. */
  hourly: { hour: string; read: number; wake: number; command: number }[];
}

export async function readTeslaCalls(now = new Date()): Promise<TeslaCallCounts> {
  if (!redis) {
    return { available: false, read: 0, wake: 0, command: 0, hourly: [] };
  }

  const hours: Date[] = [];
  for (let i = 23; i >= 0; i--) {
    hours.push(new Date(now.getTime() - i * 3600_000));
  }

  const kinds: TeslaCallKind[] = ["read", "wake", "command"];
  const keys = kinds.flatMap((kind) => hours.map((h) => bucketKey(kind, h)));

  let values: (number | null)[] = [];
  try {
    values = await redis.mget<(number | null)[]>(...keys);
  } catch {
    return { available: false, read: 0, wake: 0, command: 0, hourly: [] };
  }

  const per = (kind: TeslaCallKind, index: number): number => {
    const offset = kinds.indexOf(kind) * hours.length + index;
    return Number(values[offset] ?? 0);
  };

  const hourly = hours.map((h, i) => ({
    hour: h.toISOString().slice(11, 13),
    read: per("read", i),
    wake: per("wake", i),
    command: per("command", i),
  }));

  return {
    available: true,
    read: hourly.reduce((sum, h) => sum + h.read, 0),
    wake: hourly.reduce((sum, h) => sum + h.wake, 0),
    command: hourly.reduce((sum, h) => sum + h.command, 0),
    hourly,
  };
}
