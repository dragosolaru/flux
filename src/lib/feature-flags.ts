// =============================================================================
// Feature flags.
// Simple env-driven toggles for features that ship dark and get activated when
// ready. Public (NEXT_PUBLIC_*) so the same check works on client and server.
// =============================================================================

export function isNotificationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED === "true";
}
