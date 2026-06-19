"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { Loader2 } from "lucide-react";

import { apiFetch } from "@/lib/api-fetch";

interface ChargerStats {
  totalChargers: number;
  fastChargers: number;
  lastRefresh: string | null;
}

export function ChargerHealthCard() {
  const t = useTranslations("settings.charger");
  const locale = useLocale();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["charger-stats"],
    queryFn: () => apiFetch<ChargerStats>("/api/chargers/stats"),
    staleTime: 300_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-sm text-muted-foreground">{t("unavailable")}</p>;
  }

  const lastRefresh = data.lastRefresh
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(data.lastRefresh),
      )
    : t("never");

  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <Stat label={t("total")} value={data.totalChargers.toLocaleString(locale)} />
      <Stat label={t("fast")} value={data.fastChargers.toLocaleString(locale)} />
      <div className="col-span-2">
        <Stat label={t("last_refresh")} value={lastRefresh} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  );
}
