import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CAR_DOC_TYPES } from "@/lib/documents/car-doc-types";

const FREE_ENERGY_DOCS_PER_MONTH = 5;
const FREE_VAULT_DOCS_PER_MONTH = 10;

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

/**
 * How many simulators a free account may keep.
 *
 * Simulators are not counted against the one-car limit: a mock vehicle uses no
 * Tesla quota, contacts no car, and exists so the app can be tried — including
 * tried with two cars, which is the only way to find out whether the switcher
 * works. Counting a demo against a paid limit charges for the trial.
 *
 * Capped rather than unlimited because each one seeds ~12 months of history on
 * first read, so they are cheap to serve and not free to store.
 */
const FREE_MOCK_VEHICLES = 3;

export async function canAddVehicle(
  userId: string,
  /** Simulators and real cars are limited separately — see FREE_MOCK_VEHICLES. */
  dataSource: "mock" | "real" = "real",
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const tier = await getSubscriptionTier(userId);
  if (tier !== "free") return { allowed: true };

  const supabase = createSupabaseAdminClient();
  const { count } = await supabase
    .from("vehicles")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("data_source", dataSource);

  if (dataSource === "mock") {
    if ((count ?? 0) >= FREE_MOCK_VEHICLES) {
      return {
        allowed: false,
        message: `Free tier allows ${FREE_MOCK_VEHICLES} demo cars. Delete one, or upgrade to Pro.`,
      };
    }
    return { allowed: true };
  }

  if ((count ?? 0) >= 1) {
    return {
      allowed: false,
      message: "Free tier allows 1 linked car. Upgrade to Pro for unlimited vehicles.",
    };
  }
  return { allowed: true };
}

/** Midnight on the 1st, local time — the window both quotas count over. */
function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Energy documents: 5/month on free.
 *
 * These were `return { allowed: true }` behind a `TODO(live): re-enable before
 * launch`, so free-tier OCR was unmetered — every upload runs Claude Vision and
 * the bill has no ceiling. Restored from 32ac1aa, but counted against the
 * current CAR_DOC_TYPES list: the copy that shipped with the original limits
 * had six entries where the rest of the app has nineteen, which would have
 * charged thirteen kinds of vehicle document to the energy quota.
 *
 * Pending and unclassified uploads count. They cost the same OCR call, and not
 * counting them is a free unlimited quota for anyone who uploads faster than
 * the classifier runs.
 */
export async function canUploadDocument(
  userId: string,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const tier = await getSubscriptionTier(userId);
  if (tier !== "free") return { allowed: true };

  const supabase = createSupabaseAdminClient();
  const { count } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth())
    .not("document_type", "in", `(${CAR_DOC_TYPES.join(",")})`);

  if ((count ?? 0) >= FREE_ENERGY_DOCS_PER_MONTH) {
    return {
      allowed: false,
      message: `Free tier allows ${FREE_ENERGY_DOCS_PER_MONTH} energy documents a month. Upgrade to Pro for unlimited.`,
    };
  }
  return { allowed: true };
}

/**
 * Vehicle documents: 10/month on free.
 *
 * A separate bucket because the two are used at completely different rates — an
 * insurance policy or an inspection certificate arrives a few times a year,
 * an energy bill every month — so one shared limit would either starve the
 * vault or make the OCR quota meaningless.
 */
export async function canUploadVaultDocument(
  userId: string,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const tier = await getSubscriptionTier(userId);
  if (tier !== "free") return { allowed: true };

  const supabase = createSupabaseAdminClient();
  const { count } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth())
    .in("document_type", CAR_DOC_TYPES);

  if ((count ?? 0) >= FREE_VAULT_DOCS_PER_MONTH) {
    return {
      allowed: false,
      message: `Free tier allows ${FREE_VAULT_DOCS_PER_MONTH} vehicle documents a month. Upgrade to Pro for unlimited.`,
    };
  }
  return { allowed: true };
}
