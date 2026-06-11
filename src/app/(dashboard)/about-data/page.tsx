import { redirect } from "next/navigation";
import { FlaskConical, Wifi } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "About your data · Flux" };

// i18n key suffixes under aboutData.category.* — order is the display order.
const CATEGORY_KEYS = [
  "telemetry", "commands", "chargingHistory", "trips",
  "tariff", "chargingNetwork", "weather", "routing",
] as const;

function StatusBadge({ live, label }: { live: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        live
          ? "bg-chart-2/15 text-chart-2"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      )}
    >
      {live ? <Wifi className="size-3" /> : <FlaskConical className="size-3" />}
      {label}
    </span>
  );
}

export default async function AboutDataPage() {
  const t = await getTranslations("aboutData");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const liveLabel = t("live");
  const mockLabel = t("mock");

  const supabase = createSupabaseAdminClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, display_name, brand, model, data_source, nickname")
    .eq("user_id", session.user.id)
    .eq("is_active", true);

  const activeVehicles = vehicles ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subheading")}
        </p>
      </div>

      {/* Per-vehicle status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("yourVehicles")}</CardTitle>
        </CardHeader>
        <CardContent>
          {activeVehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noVehicles")}</p>
          ) : (
            <div className="divide-y">
              {activeVehicles.map((v: { id: string; display_name: string; brand: string; model: string | null; data_source: string; nickname: string | null }) => {
                const isLive = v.data_source === "live";

                return (
                  <div key={v.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-6">
                    <div className="sm:w-48">
                      <div className="font-medium">{v.nickname ?? v.display_name}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {v.brand}{v.model ? ` · ${v.model}` : ""}
                      </div>
                      <div className="mt-1">
                        <StatusBadge live={isLive} label={isLive ? liveLabel : mockLabel} />
                      </div>
                    </div>
                    <div className="grid flex-1 grid-cols-1 gap-2 text-xs min-[400px]:grid-cols-2 sm:grid-cols-3">
                      {CATEGORY_KEYS.slice(0, 4).map((key) => (
                        <div key={key} className="space-y-0.5">
                          <div className="font-medium text-muted-foreground">{t(`category.${key}.label`)}</div>
                          <StatusBadge live={isLive} label={isLive ? liveLabel : mockLabel} />
                          <div className="text-muted-foreground/70">
                            {isLive ? t(`category.${key}.liveDesc`) : t(`category.${key}.mockDesc`)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform services */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("platformServices")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {CATEGORY_KEYS.slice(4).map((key) => (
              <div key={key} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t(`category.${key}.label`)}</span>
                  <StatusBadge live={false} label={mockLabel} />
                </div>
                <p className="text-xs text-muted-foreground">{t(`category.${key}.mockDesc`)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("footer")}
      </p>
    </div>
  );
}
