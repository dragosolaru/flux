import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  User,
  Mail,
  Globe,
  DollarSign,
  MapPin,
  MessageCircle,
  Zap,
  CreditCard,
  Car,
  ChevronRight,
  Trash2,
} from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { CurrencyPicker } from "@/components/settings/CurrencyPicker";
import { HomeLocationPicker } from "@/components/settings/HomeLocationPicker";
import { LocalePicker } from "@/components/settings/LocalePicker";
import { WhatsAppPhonePicker } from "@/components/settings/WhatsAppPhonePicker";
import { DangerZone } from "./danger-zone";
import { TariffProviderPicker } from "./tariff-provider-picker";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { DEFAULT_PROVIDER_ID, listProviders } from "@/lib/external/tariffs/registry";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";

export const metadata = {
  title: "Settings · Flux",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations();

  const supabase = createSupabaseAdminClient();

  const [{ data: vehicles }, { data: userSettings }, { data: profile }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, display_name, brand, model, data_source")
      .eq("user_id", session.user.id)
      .eq("is_active", true),
    supabase
      .from("user_settings")
      .select("tariff_provider")
      .eq("user_id", session.user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", session.user.id)
      .single(),
  ]);

  const subscriptionTier = (
    (profile as { subscription_tier?: string } | null)?.subscription_tier ?? "free"
  ) as "free" | "pro";

  const activeProvider = userSettings?.tariff_provider ?? DEFAULT_PROVIDER_ID;
  const providers = listProviders().map((p) => ({ id: p.id, displayName: p.displayName }));

  return (
    <PageWrapper className="mx-auto max-w-2xl pb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>

      {/* Account section */}
      <section>
        <SectionHeader label={t("settings.section.account")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRow
            icon={<User className="size-4 text-blue-400" />}
            iconBg="bg-blue-500/20"
            label={t("settings.account.name")}
            value={session.user.name ?? "—"}
          />
          <SettingsRow
            icon={<Mail className="size-4 text-purple-400" />}
            iconBg="bg-purple-500/20"
            label={t("settings.account.email")}
            value={session.user.email ?? "—"}
          />
        </GlassCard>
      </section>

      {/* Preferences section */}
      <section>
        <SectionHeader label={t("settings.section.preferences")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRow
            icon={<Globe className="size-4 text-green-400" />}
            iconBg="bg-green-500/20"
            label={t("settings.locale.label")}
            control={<LocalePicker />}
          />
          <SettingsRow
            icon={<DollarSign className="size-4 text-yellow-400" />}
            iconBg="bg-yellow-500/20"
            label={t("settings.currency.label")}
            control={<CurrencyPicker />}
          />
        </GlassCard>
      </section>

      {/* Location section */}
      <section id="home-location">
        <SectionHeader label={t("settings.section.location")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRowExpanded
            icon={<MapPin className="size-4 text-red-400" />}
            iconBg="bg-red-500/20"
            label={t("settings.home_location.label")}
          >
            <HomeLocationPicker />
          </SettingsRowExpanded>
          <SettingsRowExpanded
            icon={<MessageCircle className="size-4 text-green-400" />}
            iconBg="bg-green-500/20"
            label="WhatsApp"
          >
            <WhatsAppPhonePicker />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Vehicles section */}
      <section>
        <SectionHeader label={t("settings.section.vehicles")} />
        <GlassCard className="divide-y divide-white/5">
          {(vehicles ?? []).length === 0 ? (
            <SettingsRow
              icon={<Car className="size-4 text-blue-400" />}
              iconBg="bg-blue-500/20"
              label={t("settings.vehicles.empty")}
            />
          ) : (
            (vehicles ?? []).map(
              (v: {
                id: string;
                display_name: string;
                brand: string;
                model: string | null;
                data_source: string;
              }) => (
                <SettingsRow
                  key={v.id}
                  icon={<Car className="size-4 text-blue-400" />}
                  iconBg="bg-blue-500/20"
                  label={v.display_name}
                  value={`${v.brand}${v.model ? ` · ${v.model}` : ""}`}
                />
              ),
            )
          )}
          <Link href="/garage" className="block">
            <SettingsRow
              icon={<ChevronRight className="size-4 text-muted-foreground" />}
              iconBg="bg-white/5"
              label={t("settings.vehicles.go_to_garage")}
              chevron
            />
          </Link>
        </GlassCard>
      </section>

      {/* Energy tariff section */}
      <section id="tariff">
        <SectionHeader label={t("settings.section.tariff")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRowExpanded
            icon={<Zap className="size-4 text-yellow-400" />}
            iconBg="bg-yellow-500/20"
            label={t("settings.tariff.label")}
          >
            <TariffProviderPicker activeProvider={activeProvider} providers={providers} />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Subscription section */}
      <section id="billing">
        <SectionHeader label={t("settings.section.billing")} />
        <GlassCard className="divide-y divide-white/5">
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <CreditCard className="size-4 text-primary" />
            </div>
            <div className="flex flex-1 items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {subscriptionTier === "pro"
                    ? t("settings.billing.plan_pro")
                    : t("settings.billing.plan_free")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {subscriptionTier === "pro"
                    ? t("settings.billing.plan_pro_desc")
                    : t("settings.billing.plan_free_desc")}
                </p>
              </div>
              {subscriptionTier === "pro" ? (
                <ManageSubscriptionButton />
              ) : (
                <UpgradeButton size="sm" label={t("settings.billing.upgrade_label")} />
              )}
            </div>
          </div>
          {subscriptionTier === "free" && (
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {t("settings.billing.pro_unlock_note")}{" "}
                <a href="/pricing" className="underline underline-offset-2">
                  {t("settings.billing.see_all_features")}
                </a>
              </p>
            </div>
          )}
        </GlassCard>
      </section>

      {/* Danger zone section */}
      <section>
        <SectionHeader label={t("settings.section.danger")} />
        <GlassCard>
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/20">
              <Trash2 className="size-4 text-destructive" />
            </div>
            <span className="flex-1 text-sm font-medium text-destructive">
              {t("settings.danger_zone.delete_button")}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <DangerZone />
            </div>
          </div>
        </GlassCard>
      </section>
    </PageWrapper>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  );
}

interface SettingsRowProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value?: string;
  control?: React.ReactNode;
  chevron?: boolean;
}

function SettingsRow({ icon, iconBg, label, value, control, chevron }: SettingsRowProps) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {value && <span className="text-sm text-muted-foreground">{value}</span>}
      {control && <div className="shrink-0">{control}</div>}
      {chevron && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </div>
  );
}

interface SettingsRowExpandedProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  children: React.ReactNode;
}

function SettingsRowExpanded({ icon, iconBg, label, children }: SettingsRowExpandedProps) {
  return (
    <div className="px-4 py-3">
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="ml-11">{children}</div>
    </div>
  );
}
