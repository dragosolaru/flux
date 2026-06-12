"use client";

import { useEffect } from "react";
import { X, Zap, Clock, Battery, BatteryFull } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChargingStop } from "@/lib/external/routing/types";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { useCurrency } from "@/hooks/useCurrency";

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
  const { fromEUR } = useCurrency();
  const { station, arriveSoc, departSoc, chargingMinutes, energyAddedKwh, costEur } = stop;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop — tap to dismiss */}
      <div
        className="fixed inset-0 z-[1090] bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom sheet — on md+ screens becomes a side card anchored to the right. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={station.name}
        className="fixed bottom-0 left-0 right-0 z-[1100] animate-slide-up rounded-t-3xl border-t border-white/10 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-xl backdrop-blur-xl dark:bg-zinc-900/90 md:bottom-6 md:left-auto md:right-6 md:max-w-md md:rounded-2xl md:border"
        style={{ maxHeight: "85dvh" }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-2.5">
          <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        <div className="overflow-y-auto px-5 pb-8 pt-4" style={{ maxHeight: "calc(85dvh - 1.5rem)" }}>
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
              aria-label="Close"
              className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 2×2 stats grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {/* Power */}
            <div className="rounded-xl border border-white/10 bg-white/60 p-3 dark:bg-zinc-800/60">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="size-3.5" />
                {t("power")}
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">{station.maxKw} kW</p>
            </div>

            {/* Charging time */}
            <div className="rounded-xl border border-white/10 bg-white/60 p-3 dark:bg-zinc-800/60">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                {t("charge_time")}
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">{chargingMinutes} min</p>
            </div>

            {/* Arrive SoC */}
            <div className="rounded-xl border border-white/10 bg-white/60 p-3 dark:bg-zinc-800/60">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Battery className="size-3.5" />
                {t("arrive_soc")}
              </div>
              <p className="mt-1 text-base font-semibold text-amber-500">{arriveSoc}%</p>
            </div>

            {/* Depart SoC */}
            <div className="rounded-xl border border-white/10 bg-white/60 p-3 dark:bg-zinc-800/60">
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
            <div className="flex-1 rounded-xl border border-white/10 bg-white/60 px-3 py-2.5 dark:bg-zinc-800/60">
              <p className="text-xs text-muted-foreground">{t("energy_added")}</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{energyAddedKwh.toFixed(1)} kWh</p>
            </div>

            {/* Est. cost — only when non-zero */}
            {costEur > 0 && (
              <div className="flex-1 rounded-xl border border-white/10 bg-white/60 px-3 py-2.5 dark:bg-zinc-800/60">
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
