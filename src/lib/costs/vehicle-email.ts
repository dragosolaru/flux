/**
 * Per-vehicle inbound email address.
 *
 * Format: {cloudmailin-local}+{vehicleShortId}@{cloudmailin-domain}
 * Example: 2b31b9c101b11f6682f3+f793064e@cloudmailin.net
 *
 * The first 8 hex chars of the vehicle UUID are used as the subaddress.
 * The webhook matches this against vehicle IDs with a prefix search.
 */

export function vehicleInboxAddress(vehicleId: string): string {
  const shortId = vehicleId.replace(/-/g, "").slice(0, 8);
  const cloudmailin = process.env.NEXT_PUBLIC_CLOUDMAILIN_ADDRESS;

  if (cloudmailin) {
    const atIdx = cloudmailin.indexOf("@");
    if (atIdx > 0) {
      const local = cloudmailin.slice(0, atIdx);
      const domain = cloudmailin.slice(atIdx + 1);
      return `${local}+${shortId}@${domain}`;
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://flux.vercel.app";
  const domain = appUrl.replace(/^https?:\/\//, "").split("/")[0];
  return `flux+${shortId}@${domain}`;
}
