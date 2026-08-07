// Where the project is, in one place.
//
// `docs/TODO.md` is the long form — every loose end, with the reasoning. This
// is the short form: the handful of things between here and paying customers,
// each with the single next action.
//
// Every item that can be checked against the running deployment IS, so the list
// cannot quietly go stale the way a hand-maintained checklist does. Items with
// no `check` are judgement calls and stay manual — those are the ones to review
// when something feels wrong.

export interface Milestone {
  /** What we are trying to reach. */
  goal: string;
  /** The single next action. Not a list — if it needs a list, it is two items. */
  nextStep: string;
  /**
   * Resolved against the debug route's config. Omit when the milestone cannot
   * be observed from the outside; it then reports as "manual".
   */
  check?: (c: Record<string, boolean | string>) => boolean;
}

export const GOAL = "Real customers driving on Flux, with their own Tesla linked.";

export const ROADMAP: Milestone[] = [
  {
    goal: "Charger data good enough to plan a real trip",
    nextStep:
      "Re-import France with the per-plug grouping fixed, then run dedupe until it reports 0.",
    // Sources that actually produce rows. OCM alone is not enough for a corridor.
    check: (c) => c.tomtomKey === true && c.openChargeMapKey === true,
  },
  {
    goal: "Tesla linked and commands working",
    nextStep: "Set TESLA_PUBLIC_KEY, register the partner account on the EU host.",
    check: (c) => c.teslaLive === true && c.teslaProxy === true,
  },
  {
    goal: "Paid plans can actually be bought",
    nextStep: "Add the Stripe live keys and the two price IDs.",
    check: (c) => c.stripe === true,
  },
  {
    goal: "Subscription limits enforced",
    nextStep:
      "Restore the pre-9715eb1 bodies of canUploadDocument / canUploadVaultDocument — they are TODO(live) stubs returning allowed:true.",
    // Not observable from config: the stubs return the same shape as the real
    // check, which is exactly why this needs a human to confirm.
  },
  {
    goal: "Real-time stall availability",
    nextStep:
      "NDW carries live availabilities[] for the Netherlands — decide whether to surface it before buying a commercial feed for the rest.",
  },
];

export type MilestoneState = "done" | "todo" | "manual";

export function resolveRoadmap(
  config: Record<string, boolean | string>,
): { goal: string; nextStep: string; state: MilestoneState }[] {
  return ROADMAP.map((m) => ({
    goal: m.goal,
    nextStep: m.nextStep,
    state: m.check ? (m.check(config) ? "done" : "todo") : "manual",
  }));
}
