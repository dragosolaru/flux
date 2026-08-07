"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { CheckCircle2, History, Loader2, XCircle } from "lucide-react";

import { apiFetch } from "@/lib/api-fetch";

interface CommandEvent {
  command: string;
  success: boolean;
  error_code: string | null;
  source: string;
  issued_at: string;
}

/**
 * The audit trail for a vehicle. command_events has always been written and is
 * in the data export, but was shown nowhere — so an owner could not notice an
 * unlock they did not issue. Sensitive commands are called out so they stand
 * apart from routine ones.
 */
const SENSITIVE = new Set(["unlock", "remote_start"]);

export function CommandHistory({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("commands.history");
  const locale = useLocale();

  const { data, isLoading, isError } = useQuery<{ events: CommandEvent[] }>({
    queryKey: ["command-history", vehicleId],
    queryFn: () => apiFetch(`/api/vehicles/${vehicleId}/command-history`),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (isError) return <p className="text-sm text-muted-foreground">{t("error")}</p>;

  const events = data?.events ?? [];
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <History className="size-4 text-muted-foreground" />
        {t("title")}
      </div>
      <ul className="divide-y divide-border/60 rounded-xl border border-border">
        {events.map((e, i) => (
          <li key={i} className="flex items-center gap-2.5 px-3 py-2.5">
            {e.success ? (
              <CheckCircle2 className="size-4 shrink-0 text-green-500" />
            ) : (
              <XCircle className="size-4 shrink-0 text-destructive" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {e.command}
                {SENSITIVE.has(e.command) && (
                  <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                    {t("sensitive")}
                  </span>
                )}
              </p>
              {!e.success && e.error_code && (
                <p className="truncate text-xs text-destructive">{e.error_code}</p>
              )}
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(e.issued_at))}
            </time>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("footer")}</p>
    </div>
  );
}
