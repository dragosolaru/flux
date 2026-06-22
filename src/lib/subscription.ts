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

const CAR_DOC_TYPES = ["rca", "itp", "rovinieta", "vignette", "bridge_toll", "car_tax"];

export async function canUploadDocument(
  userId: string,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const tier = await getSubscriptionTier(userId);
  if (tier !== "free") return { allowed: true };

  const supabase = createSupabaseAdminClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Count energy docs (classified as energy type OR still pending/unclassified).
  // Car-doc uploads go through canUploadVaultDocument separately.
  const { count } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString())
    .not("document_type", "in", `(${CAR_DOC_TYPES.join(",")})`);

  if ((count ?? 0) >= 5) {
    return {
      allowed: false,
      message: "Free tier allows 5 energy documents/month. Upgrade to Pro for unlimited.",
    };
  }
  return { allowed: true };
}

export async function canUploadVaultDocument(
  userId: string,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const tier = await getSubscriptionTier(userId);
  if (tier !== "free") return { allowed: true };

  const supabase = createSupabaseAdminClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Count already-classified car docs this month (pending ones don't count —
  // car docs are uploaded at most a few times a year so abuse risk is negligible).
  const { count } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString())
    .in("document_type", CAR_DOC_TYPES);

  if ((count ?? 0) >= 10) {
    return {
      allowed: false,
      message: "Free tier allows 10 vehicle documents/month. Upgrade to Pro for unlimited.",
    };
  }
  return { allowed: true };
}
