/**
 * Per-user inbound email address.
 *
 * Format: {cloudmailin-local}+{user-local-part}@{cloudmailin-domain}
 * Example: clxxxxx+dragosandreiolaru@cloudmailin.net
 *
 * The webhook extracts the subaddress and looks up the Supabase auth user
 * whose email starts with `{subaddress}@`.
 */

const EMAIL_SLUG_MAX_LEN = 32;

export function userEmailSlug(userEmail: string): string {
  return userEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, EMAIL_SLUG_MAX_LEN);
}

export function userInboxAddress(userEmail: string): string {
  const slug = userEmailSlug(userEmail);
  const cloudmailin = process.env.NEXT_PUBLIC_CLOUDMAILIN_ADDRESS;

  if (cloudmailin) {
    const atIdx = cloudmailin.indexOf("@");
    if (atIdx > 0) {
      const local = cloudmailin.slice(0, atIdx);
      const domain = cloudmailin.slice(atIdx + 1);
      return `${local}+${slug}@${domain}`;
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://flux.vercel.app";
  const domain = appUrl.replace(/^https?:\/\//, "").split("/")[0];
  return `flux+${slug}@${domain}`;
}
