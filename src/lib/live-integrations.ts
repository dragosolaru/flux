// =============================================================================
// LIVE_INTEGRATIONS env flag.
// Comma-separated list of brand keys for which live API calls are enabled.
// Default (empty / unset) = everything runs against the mock simulator.
// Example: LIVE_INTEGRATIONS=tesla,bmw
// =============================================================================

const ENABLED: ReadonlySet<string> = new Set(
  (process.env.LIVE_INTEGRATIONS ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
);

export function isLiveEnabled(brand: string): boolean {
  return ENABLED.has(brand);
}
