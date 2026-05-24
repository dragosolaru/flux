import type { User } from "@supabase/supabase-js";
import type { Session } from "next-auth";
import { createSupabaseAdminClient } from "./server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns the Supabase auth.users UUID for the session user.
 *
 * NextAuth stores Google's numeric `sub` as session.user.id on the first
 * sign-in (before our JWT callback can override it with the Supabase UUID).
 * Any route that writes to Supabase needs a real UUID or the FK constraint
 * on vehicles.user_id will reject the insert.
 *
 * Resolution order:
 *   1. session.user.id is already a UUID → return as-is (fast path, no DB).
 *   2. Try createUser by email (one call; works for brand-new Google users).
 *   3. User already registered → scan listUsers by email (bounded at 1000).
 */
export async function ensureSupabaseUserId(
  session: Session,
): Promise<string | null> {
  const rawId = session.user?.id;

  if (rawId && UUID_RE.test(rawId)) {
    // Verify the UUID actually exists in auth.users — NextAuth v5 can generate
    // its own UUID for OAuth sessions that never matches a Supabase auth entry.
    const supabase = createSupabaseAdminClient();
    const { data: existing } = await supabase.auth.admin.getUserById(rawId);
    if (existing.user) return rawId;
    // UUID not in auth.users — fall through to email-based resolution below.
  }

  const email = session.user?.email;
  if (!email) return null;

  const supabase = createSupabaseAdminClient();

  // Fast path: create the Supabase user (no-op if we race with another request)
  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: session.user?.name ?? undefined,
        avatar_url: session.user?.image ?? undefined,
      },
    });

  if (!createErr && created.user) return created.user.id;

  // User already exists — find by email via paginated scan (max 1 000 users)
  let page = 1;
  while (page <= 10) {
    const { data } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    const match = data?.users.find((u: User) => u.email === email);
    if (match) return match.id;
    if (!data || data.users.length < 100) break;
    page++;
  }

  return null;
}
