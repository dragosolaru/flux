"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CalendarClock, Gauge, Receipt } from "lucide-react";

import { Card, StatTile } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/useCurrency";
import { apiFetch } from "@/lib/api-fetch";
import type { VehicleRecord } from "@/app/api/vehicles/[vehicleId]/record/route";

/**
 * The first screen for someone's own car.
 *
 * The dashboard was a battery hero, which was right while there was a car to
 * read and became a blank page with a green "Live" badge when there was not.
 * A vehicle here is a record — paperwork, costs, kilometres — so this shows the
 * three things that record can actually answer.
 *
 * Every one of them is null until a document or a reading arrives, and each
 * says so in its own words rather than showing a zero. "0 lei this month" is a
 * confident claim about a month nobody has uploaded anything for.
 */
export function VehicleRecordCard({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("vehicle_record");
  // Document type names already exist as `documents.type_*` and are used on the
  // documents screen. Reusing them keeps one vocabulary; inventing a second set
  // here is how the same document ends up with two names in one app.
  const td = useTranslations("documents");
  const { fromRON } = useCurrency();
  const { data, isLoading } = useQuery({
    queryKey: ["vehicle-record", vehicleId],
    queryFn: () => apiFetch<VehicleRecord>(`/api/vehicles/${vehicleId}/record`),
    enabled: vehicleId !== "",
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;

  const km = data?.odometerKm;
  const cost = data?.monthCostRon;
  const deadline = data?.nextDeadline;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <StatTile
          className="flex-1"
          value={km != null ? `${Math.round(km).toLocaleString()} km` : "—"}
          label={t("odometer")}
        />
        <StatTile
          className="flex-1"
          value={cost != null ? fromRON(cost, 0) : "—"}
          label={t("month_cost")}
          accent={cost != null ? "text-chart-2" : undefined}
        />
      </div>

      {/*
        The deadline is why this screen exists. Nobody opens an app to look at a
        number; they open it not to be fined. So it gets a row of its own rather
        than a third tile, and it changes colour as it approaches — under a
        fortnight is the point where doing something about it takes planning.
      */}
      <Card variant="surface" className="flex items-center gap-3 p-3">
        <CalendarClock
          className={`size-4 shrink-0 ${
            deadline && deadline.daysLeft <= 14 ? "text-chart-3" : "text-muted-foreground"
          }`}
        />
        <div className="min-w-0 flex-1">
          {deadline ? (
            <>
              <p className="truncate text-sm font-medium">
                {td.has(`type_${deadline.type}`)
                  ? td(`type_${deadline.type}`)
                  : deadline.type}
              </p>
              <p className="text-2xs text-muted-foreground">
                {t("expires_in", { days: deadline.daysLeft })} ·{" "}
                {deadline.validUntil}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("no_deadline")}</p>
          )}
        </div>
      </Card>

      {km == null && (
        <p className="text-2xs text-muted-foreground">
          <Gauge className="mr-1 inline size-3" />
          {t("no_odometer")}
        </p>
      )}
      {cost == null && (
        <p className="text-2xs text-muted-foreground">
          <Receipt className="mr-1 inline size-3" />
          {t("no_cost")}
        </p>
      )}
    </div>
  );
}
