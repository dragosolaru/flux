// Debug-surface access control.
//
// There is no role column on profiles, and adding one for a development tool
// would be more moving parts than the tool is worth. Access is an env allowlist
// instead: ADMIN_EMAILS, comma-separated. Unset means nobody qualifies, so the
// debug surface is closed by default in every environment it is not configured
// for — including production, unless it is deliberately opened.

import { auth } from "@/lib/auth";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export interface AdminSession {
  userId: string;
  email: string;
}

/**
 * Resolves the caller only when they are signed in AND listed in ADMIN_EMAILS.
 * Returns null otherwise — callers must translate that into a 404, not a 403,
 * so the surface does not advertise its own existence.
 */
export async function requireAdmin(): Promise<AdminSession | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const userId = session?.user?.id;
  if (!email || !userId) return null;

  const allowed = adminEmails();
  if (allowed.length === 0 || !allowed.includes(email)) return null;

  return { userId, email };
}

export async function isAdmin(): Promise<boolean> {
  return (await requireAdmin()) !== null;
}
