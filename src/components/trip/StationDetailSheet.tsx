"use client";

import { X, Zap, Clock, Battery, BatteryFull } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChargingStop } from "@/lib/external/routing/types";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { useCurrency } from "@/hooks/useCurrency";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface StationDetailSheetProps {
  stop: ChargingStop;
  onClose: () => void;
}

function networkBadgeClass(networkId: string): string {
  if (networkId === "tesla-sc") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (networkId === "ionity") return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

export function StationDetailSheet({ stop, onClose }: StationDetailSheetProps) {
  const t = useTranslations("trip.station");
  const tc = useTranslations("common");
  const { fromEUR } = useCurrency();
  const { station, arriveSoc, departSoc, chargingMinutes, energyAddedKwh, costEur } = stop;
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);

  return (
    <>
      {/* Backdrop — tap to dismiss. Proper scrim so nothing reads as a void. */}
      <div
        className="fixed inset-0 z-[1090] bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating card — hugs content, sits clear above the BottomNav. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={station.name}
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+90px)] z-[1100] animate-slide-up overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-6 md:right-6 md:max-w-md"
        style={{ maxHeight: "70dvh" }}
      >
        <div className="overflow-y-auto px-5 pb-5 pt-4" style={{ maxHeight: "70dvh" }}>
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight text-foreground">{station.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded border px-1.5 py-0.5 text-xs font-medium ${networkBadgeClass(station.networkId)}`}
                >
                  {station.networkId}
                </span>
                <ReliabilityBadge station={station} />
                <span className="text-xs text-muted-foreground">
                  {station.addressCity}{station.addressCountry ? `, ${station.addressCountry}` : ""}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={tc("close")}
              className="-mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 2×2 stats grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {/* Power */}
            <div className="rounded-xl border border-border bg-muted/50 p-3 ">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="size-3.5" />
                {t("power")}
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">{station.maxKw} kW</p>
            </div>

            {/* Charging time */}
            <div className="rounded-xl border border-border bg-muted/50 p-3 ">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                {t("charge_time")}
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">{chargingMinutes} min</p>
            </div>

            {/* Arrive SoC */}
            <div className="rounded-xl border border-border bg-muted/50 p-3 ">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Battery className="size-3.5" />
                {t("arrive_soc")}
              </div>
              <p className="mt-1 text-base font-semibold text-amber-500">{arriveSoc}%</p>
            </div>

            {/* Depart SoC */}
            <div className="rounded-xl border border-border bg-muted/50 p-3 ">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BatteryFull className="size-3.5" />
                {t("depart_soc")}
              </div>
              <p className="mt-1 text-base font-semibold text-green-500">{departSoc}%</p>
            </div>
          </div>

          {/* Secondary stats row */}
          <div className="mt-3 flex flex-wrap gap-3">
            {/* Energy added */}
            <div className="flex-1 rounded-xl border border-border bg-muted/50 px-3 py-2.5 ">
              <p className="text-xs text-muted-foreground">{t("energy_added")}</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{energyAddedKwh.toFixed(1)} kWh</p>
            </div>

            {/* Est. cost — only when non-zero */}
            {costEur > 0 && (
              <div className="flex-1 rounded-xl border border-border bg-muted/50 px-3 py-2.5 ">
                <p className="text-xs text-muted-foreground">{t("cost")}</p>
                <p className="mt-0.5 text-sm font-semibold text-green-400">{fromEUR(costEur)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
