/**
 * Per-vehicle inbound email address.
 *
 * Format: {cloudmailin-local}+{vehicleShortId}@{cloudmailin-domain}
 * Example: 2b31b9c101b11f6682f3+f793064e@cloudmailin.net
 *
 * The first 8 hex chars of the vehicle UUID are used as the subaddress.
 * The webhook matches this against vehicle IDs with a UUID range query.
 *
 * Fails loudly if NEXT_PUBLIC_CLOUDMAILIN_ADDRESS is unset — silently
 * rendering a fake address that emails would bounce from is worse than
 * a clear error in the UI.
 */

export function vehicleInboxAddress(vehicleId: string): string | null {
  const shortId = vehicleId.replace(/-/g, "").slice(0, 8);
  const cloudmailin = process.env.NEXT_PUBLIC_CLOUDMAILIN_ADDRESS;
  if (!cloudmailin) return null;

  const atIdx = cloudmailin.indexOf("@");
  if (atIdx <= 0) return null;

  const local = cloudmailin.slice(0, atIdx);
  const domain = cloudmailin.slice(atIdx + 1);
  return `${local}+${shortId}@${domain}`;
}
