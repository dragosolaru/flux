/**
 * Capability model — what each feature requires.
 *
 * Server-safe: pure functions, no React. Used by both server routes
 * (e.g. /api/me/capabilities) and indirectly by the client via the hook.
 */

export type Capability = "NONE" | "VEHICLE" | "TARIFF" | "PRO";

export interface CapabilityContext {
  hasVehicle: boolean;
  hasTariff: boolean;
  hasProSubscription: boolean;
}

export interface GateCta {
  label: string;
  href: string;
}

export type GateResult =
  | { ok: true }
  | { ok: false; missing: Capability; cta: GateCta };

const ORDER: Capability[] = ["NONE", "VEHICLE", "TARIFF", "PRO"];

function meets(required: Capability, ctx: CapabilityContext): boolean {
  switch (required) {
    case "NONE":
      return true;
    case "VEHICLE":
      return ctx.hasVehicle;
    case "TARIFF":
      return ctx.hasTariff;
    case "PRO":
      return ctx.hasProSubscription;
  }
}

function ctaFor(missing: Capability): GateCta {
  switch (missing) {
    case "VEHICLE":
      return { label: "empty_states.no_vehicle.cta", href: "/garage" };
    case "TARIFF":
      return { label: "empty_states.no_tariff.cta", href: "/settings#tariff" };
    case "PRO":
      return { label: "empty_states.no_pro.cta", href: "/pricing" };
    case "NONE":
      return { label: "common.continue", href: "/" };
  }
}

/**
 * checkCapability — single source of truth for "can this user see / use this feature?"
 * Returns the first unmet prerequisite (in unlock order), with the CTA i18n key
 * to surface in an empty state.
 */
export function checkCapability(
  required: Capability,
  ctx: CapabilityContext,
): GateResult {
  if (meets(required, ctx)) return { ok: true };

  // Walk the order from NONE up to required; the first unmet level is what's blocking.
  const requiredIdx = ORDER.indexOf(required);
  for (let i = 1; i <= requiredIdx; i++) {
    const level = ORDER[i];
    if (!meets(level, ctx)) {
      return { ok: false, missing: level, cta: ctaFor(level) };
    }
  }

  // Fallback — shouldn't reach here because meets() failed above.
  return { ok: false, missing: required, cta: ctaFor(required) };
}
