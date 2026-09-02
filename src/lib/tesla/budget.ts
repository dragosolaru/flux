import { redis } from "@/lib/redis";

/**
 * Nothing reaches the car without a reason and a budget.
 *
 * The polling policy lived entirely in the client hooks — `pollInterval()`,
 * `poll: false`, the sleep switch — and that turned out to be a policy with no
 * enforcement. Two paths proved it: every screen of one redesign shipped
 * polling a parked car because nobody passed the third argument, and
 * `/api/trip-plan` reads the car **server-side on every plan**, which no client
 * hook can see and which the trip screen re-runs as you drag a destination.
 *
 * So the rule moved to the boundary. Every call into Tesla declares why it is
 * happening, and this decides whether it may:
 *
 *   · **A reading is cached briefly.** Ten re-plans, three screens and two tabs
 *     inside the window are one call to the car. This is the single biggest
 *     change: it removes a whole class of accidental traffic without any caller
 *     having to be careful.
 *   · **There is a daily ceiling per vehicle**, because Tesla's is real and
 *     nothing enforced ours. Over it, the caller is told to use the last known
 *     reading rather than being allowed to spend the last of the budget on a
 *     screen nobody is looking at.
 *   · **Only a wake may wake.** Already true via `allowWake`, now tied to the
 *     stated reason so a caller cannot pass `true` by habit.
 *
 * On the vampire question specifically: a `vehicle_data` request does **not**
 * wake a sleeping car — it answers 408 — so reads are not what drains a parked
 * battery. What drains it is keeping an *awake* car awake, and a wake itself,
 * which costs roughly ten times an idle hour. That is why `wake` is counted
 * separately and expected to be zero.
 *
 * Redis is best-effort everywhere here. With no Redis the cache misses and the
 * budget cannot be counted, so the gate **opens** rather than blocking a real
 * driver over missing infrastructure — the same choice rate limiting makes.
 */

export type CallReason =
  /** A tap: a command, or a refresh the driver asked for by pressing something. */
  | "user-action"
  /** A screen opening and needing one reading to render. */
  | "screen"
  /** The daily cron, which exists to keep history unbroken. */
  | "scheduled"
  /** The one endpoint permitted to wake a sleeping car. */
  | "wake";

/**
 * How long a reading is reused before the car is asked again.
 *
 * Long enough that navigating between screens, or re-planning a trip, costs
 * nothing; short enough that a driver who taps refresh twenty seconds apart
 * still gets a fresh answer — that path is `user-action`, which skips the cache
 * entirely, so this window only ever suppresses traffic nobody asked for.
 */
export const READ_CACHE_MS = 30_000;

/**
 * Reads per vehicle per day.
 *
 * **This is a cost ceiling, not a quota ceiling, and it used to say otherwise.**
 * The comment here claimed Tesla's own limit was "a few hundred reads per
 * vehicle per day" and that without a ceiling the app would start collecting
 * 429s. Neither is true. Tesla publishes no daily cap at all; the published
 * rate limits are per minute, per device, per account — 60 realtime-data
 * requests, 30 commands, 3 wakes — and at a 30-second poll one screen uses two
 * of the sixty. Rate limiting was never the risk.
 *
 * The real risk is the invoice. Fleet API is pay-per-use: a data request costs
 * $0.002, a command $0.001, a wake $0.02, against a $10 monthly credit. So this
 * ceiling is worth **$12 per vehicle per month** — more than the subscription
 * it is meant to fit inside. It is not a safety margin under someone else's
 * limit; it is the largest bill we are willing to be handed for one car.
 *
 * Sharper still: **Tesla bills every response below HTTP 500.** A read of a
 * sleeping car answers 408 and is charged in full, so the calls that return
 * nothing cost exactly as much as the ones that work.
 *
 * Rates and limits: developer.tesla.com/docs/fleet-api/billing-and-limits,
 * read 2026-09-02. See docs/SCALING-AND-COSTS.md for the arithmetic.
 */
export const DAILY_READ_BUDGET = 200;

const CACHE_PREFIX = "tesla:read:";
const BUDGET_PREFIX = "tesla:budget:";

function today(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** A reading taken recently enough to reuse, or null. */
export async function cachedRead<T>(vehicleId: string): Promise<T | null> {
  try {
    if (!redis) return null;
    const hit = await redis.get(`${CACHE_PREFIX}${vehicleId}`);
    return (hit as T | null) ?? null;
  } catch {
    return null;
  }
}

export async function storeRead(vehicleId: string, state: unknown): Promise<void> {
  try {
    if (!redis) return;
    await redis.set(`${CACHE_PREFIX}${vehicleId}`, state, {
      px: READ_CACHE_MS,
    });
  } catch {
    // A cache that cannot be written is a slower app, not a broken one.
  }
}

export interface BudgetVerdict {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Count one read against the day's budget and say whether it may proceed.
 *
 * `user-action` and `wake` are counted but never blocked: a driver pressing a
 * button and being told "no" by their own app, while the car sits there
 * answering, is a worse failure than one extra call. The ceiling exists to stop
 * *automatic* traffic, which is the traffic that got us here.
 */
export async function chargeReadBudget(
  vehicleId: string,
  reason: CallReason,
  at = new Date(),
): Promise<BudgetVerdict> {
  const limit = DAILY_READ_BUDGET;
  try {
    if (!redis) return { allowed: true, used: 0, limit };

    const key = `${BUDGET_PREFIX}${vehicleId}:${today(at)}`;
    const used = await redis.incr(key);
    if (used === 1) await redis.expire(key, 48 * 60 * 60);

    const deliberate = reason === "user-action" || reason === "wake";
    return { allowed: deliberate || used <= limit, used, limit };
  } catch {
    return { allowed: true, used: 0, limit };
  }
}

/** What the day has cost so far, without spending any of it. */
export async function readBudgetUsed(vehicleId: string, at = new Date()): Promise<number> {
  try {
    if (!redis) return 0;
    const used = await redis.get(`${BUDGET_PREFIX}${vehicleId}:${today(at)}`);
    return typeof used === "number" ? used : Number(used ?? 0) || 0;
  } catch {
    return 0;
  }
}
