// Where the project is, in one place.
//
// `docs/NEXT-STEPS.md` is the long form — the reasoning behind each item and
// what to actually do. This is the short form the debug panel renders, so the
// list is readable from a phone without opening the repo.
//
// Every item that can be checked against the running deployment IS, so the list
// cannot quietly go stale the way a hand-maintained checklist does. Items with
// no `check` are judgement calls and stay manual — those are the ones to review
// when something feels wrong.
//
// Grouped into gates rather than a flat list. A flat list makes "add the Stripe
// keys" and "the signing proxy is an open relay" look like peers, and they are
// not: one is a task, the other is the reason a partner account gets suspended.

export type Gate = 1 | 2 | 3;

export const GATES: Record<Gate, string> = {
  1: "Before a second person's car is linked",
  2: "Before anyone pays",
  3: "What actually differentiates the product",
};

export interface Milestone {
  gate: Gate;
  /** What we are trying to reach. */
  goal: string;
  /** The single next action. Not a list — if it needs a list, it is two items. */
  nextStep: string;
  /**
   * What breaks if this is skipped. Present on everything that is not merely a
   * task, because "nice to have" and "the reason a customer leaves" look
   * identical on a checklist.
   */
  cost?: string;
  /**
   * Resolved against the debug route's config. Omit when the milestone cannot
   * be observed from the outside; it then reports as "manual".
   */
  check?: (c: Record<string, boolean | string>) => boolean;
}

export const GOAL = "Real customers driving on Flux, with their own Tesla linked.";

export const ROADMAP: Milestone[] = [
  // ---- Gate 1 -------------------------------------------------------------
  {
    gate: 1,
    goal: "Charger data good enough to plan a real trip",
    nextStep:
      "Re-import France with the per-plug grouping fixed, then run dedupe until it reports 0.",
    check: (c) => c.tomtomKey === true && c.openChargeMapKey === true,
  },
  {
    gate: 1,
    goal: "Tesla linked and commands working",
    nextStep: "Done — partner registered, proxy deployed, commands confirmed on the car.",
    check: (c) => c.teslaLive === true && c.teslaProxy === true,
  },
  {
    gate: 1,
    goal: "The signing proxy refuses strangers (T10)",
    nextStep:
      "Shared secret header checked in Caddy before reverse_proxy, set on the container and as TESLA_PROXY_SECRET in Vercel. About twenty lines.",
    cost:
      "It is an open relay. Anyone who finds the hostname and holds a valid Tesla token for a paired account can have your private key sign commands, on your quota. Your partner account is the one Tesla suspends.",
  },
  {
    gate: 1,
    goal: "Fleet API quota survives more than one user (T6)",
    nextStep:
      "An app-wide rate bucket inside fetchVehicleData/sendVehicleCommand, plus a 20-30s Redis cache of vehicle_data per vehicle so tabs and routes share one upstream call.",
    cost:
      "Limits are per user; Tesla counts per partner account. One open dashboard already sits at its own ceiling, so ten users put the app at ten times whatever Tesla allows — and it throttles everyone at once.",
  },
  {
    gate: 1,
    goal: "Show which cars Tesla bills at the discounted rate",
    nextStep:
      "fleet_status already returns discounted_device_data per VIN and we already call it from Check pairing — surface the flag. One field.",
    cost:
      "Tesla bills the partner account per request, not per car, so cost tracking has to be per vehicle and per request volume. Cheap to add now, guesswork once there are many cars. See docs/SCALING-AND-COSTS.md.",
  },
  {
    gate: 1,
    goal: "Commands work on a sleeping car (T3/T4)",
    nextStep:
      "GET /api/1/vehicles/{id} first (cheap, does not wake); if not online, wake_up DIRECT — never through the proxy — poll with 2/4/8/15s backoff, then send. Distinct VEHICLE_ASLEEP code.",
    cost:
      "Cars sleep most of the time, and the logs already show vehicle_data 408 vehicle unavailable. Roughly half of real command attempts fail with no explanation.",
  },

  // ---- Gate 2 -------------------------------------------------------------
  {
    gate: 2,
    goal: "Cost Intelligence reports the right money (C1-C5)",
    nextStep:
      "Decide the single meaning of energy_costs.cost_ron first, then fix all four together: attribution filters network IS NULL to find HOME charging, the whole household bill lands on the car when no session matches, /api/costs multiplies by the attribution fraction a second time, and the billing period drops its last day. A migration will be needed for stored rows.",
    cost:
      "The number the product exists to produce is wrong and nothing reports it. People do not complain — they stop trusting it.",
  },
  {
    gate: 2,
    goal: "Subscription limits enforced",
    nextStep: "Done — 5 energy and 10 vehicle documents a month, restored in f408593.",
    check: () => true,
  },
  {
    gate: 2,
    goal: "Paid plans can actually be bought",
    nextStep: "Add the Stripe live keys and the two price IDs.",
    check: (c) => c.stripe === true,
  },
  {
    gate: 2,
    goal: "A second user can verify their email",
    nextStep:
      "One button in Settings calling POST /api/account/verify-email, one banner while profiles.email_verified_at is null. Needs RESEND_API_KEY and RESEND_FROM.",
    cost:
      "The API works and nothing calls it. You are exempt via ADMIN_EMAILS, so the first real user hits 403 EMAIL_NOT_VERIFIED on document recovery with no way out.",
  },

  // ---- Gate 3 -------------------------------------------------------------
  {
    gate: 3,
    goal: "Fleet Telemetry — the car streams instead of being polled",
    nextStep:
      "An mTLS receiver on the same host as the signing proxy, plus a fleet_telemetry_config call per vehicle. Comparable in size to the proxy work.",
    cost:
      "The only route to real charging history (dx/charging/history is 403 on personal accounts), real consumption, and vampire drain — which polling cannot measure, because each measurement wakes the car. Every Tesla app polls; almost none stream. This is the differentiator.",
  },
  {
    gate: 3,
    goal: "Own domain, off Vercel",
    nextStep:
      "Buy the domain now; do the move and the domain change TOGETHER when Fleet Telemetry forces it. Full order of operations in docs/HOSTING-AND-DOMAIN.md.",
    cost:
      "Changing the domain re-registers the partner account and UNPAIRS every car — the key, the redirect URI and the _ak link are all bound to it. Cheap with one car, expensive with customers. Vercel is also what makes the proxy public (T10) and what makes Fleet Telemetry impossible.",
  },
  {
    gate: 3,
    goal: "The redesign — every screen rebuilt in the Instrument direction",
    nextStep:
      "Open /v2 on the phone beside the live app and judge it screen by screen. One screen is ported at a time; status and findings live in docs/REDESIGN-V2.md.",
    cost:
      "Two versions of every screen is a cost that only pays off if it ends. Each ported screen must either replace its original or be deleted — a permanent /v2 is the worst outcome of the three.",
  },
  {
    gate: 3,
    goal: "Real-time stall availability",
    nextStep:
      "NDW already carries live availabilities[] for the Netherlands, free. Prove the UI on one country before paying for a commercial feed.",
  },
];

export type MilestoneState = "done" | "todo" | "manual";

export interface ResolvedMilestone {
  gate: Gate;
  gateLabel: string;
  goal: string;
  nextStep: string;
  cost?: string;
  state: MilestoneState;
}

export function resolveRoadmap(
  config: Record<string, boolean | string>,
): ResolvedMilestone[] {
  return ROADMAP.map((m) => ({
    gate: m.gate,
    gateLabel: GATES[m.gate],
    goal: m.goal,
    nextStep: m.nextStep,
    ...(m.cost ? { cost: m.cost } : {}),
    state: m.check ? (m.check(config) ? "done" : "todo") : "manual",
  }));
}
