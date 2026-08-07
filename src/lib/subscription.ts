import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type SubscriptionTier = "free" | "pro";

/**
 * Accounts listed in ADMIN_EMAILS are treated as pro.
 *
 * The maintainer's own account needs more than one vehicle — a mock one to
 * develop against and a real linked car — and paying itself through Stripe to
 * get that is silly. Reuses the existing allowlist rather than adding a second
 * one: the same env var already gates the debug surface, so there is one place
 * that answers "is this the owner".
 *
 * `profiles` has no email column, so this reads auth.users. Only reached on a
 * limit check, which is rare, and skipped entirely when the allowlist is empty.
 */
async function isOwnerAccount(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
): Promise<boolean> {
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  if (allowed.length === 0) return false;

  const { data } = await supabase.auth.admin.getUserById(userId);
  const email = data?.user?.email?.toLowerCase();
  return email != null && allowed.includes(email);
}

export async function getSubscriptionTier(userId: string): Promise<SubscriptionTier> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  const stored = (data?.subscription_tier as SubscriptionTier | null) ?? "free";
  if (stored !== "free") return stored;

  return (await isOwnerAccount(supabase, userId)) ? "pro" : "free";
}

export async function canAddVehicle(
  userId: string,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const tier = await getSubscriptionTier(userId);
  if (tier !== "free") return { allowed: true };

  const supabase = createSupabaseAdminClient();
  const { count } = await supabase
    .from("vehicles")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);

  if ((count ?? 0) >= 1) {
    return {
      allowed: false,
      message: "Free tier allows 1 vehicle. Upgrade to Pro for unlimited vehicles.",
    };
  }
  return { allowed: true };
}

// TODO(live): re-enable per-tier limits before launch
export async function canUploadDocument(
  _userId: string,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  return { allowed: true };
}

export async function canUploadVaultDocument(
  _userId: string,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  return { allowed: true };
}
