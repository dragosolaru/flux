import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type SubscriptionTier = "free" | "pro";

export async function getSubscriptionTier(userId: string): Promise<SubscriptionTier> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();
  return (data?.subscription_tier as SubscriptionTier | null) ?? "free";
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
