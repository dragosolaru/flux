"use client";

import { X, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Charger } from "@/lib/chargers/types";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ChargerDetailSheetProps {
  charger: Charger;
  onClose: () => void;
}

function networkBadgeClass(operatorId: string | null): string {
  if (operatorId === "tesla") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (operatorId === "ionity") return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

// Status dot colour + i18n label key per availability state.
const STATUS_META: Record<
  Charger["availability"],
  { color: string; labelKey: string }
> = {
  operational: { color: "#22c55e", labelKey: "operational" },
  offline: { color: "#f87171", labelKey: "out_of_service" },
  stale: { color: "#f59e0b", labelKey: "status_stale" },
  unknown: { color: "#9ca3af", labelKey: "status_unknown" },
};

export function ChargerDetailSheet({ charger, onClose }: ChargerDetailSheetProps) {
  const t = useTranslations("chargingMap");
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);

  const displayName = charger.name ?? charger.operator ?? t("station_fallback");
  const totalConnectors = charger.connectors.reduce((sum, c) => sum + c.count, 0);
  const status = STATUS_META[charger.availability];
  const addressLine = [charger.address.street, charger.address.city]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      {/* Backdrop — tap to dismiss. A proper scrim so the dimmed map (or the
          expanded explore sheet behind) reads as intentional, not a void. */}
      <div
        className="absolute inset-0 z-[1090] bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating card — hugs its content and sits clear above the BottomNav, so
          there's no dead space below it. On md+ it anchors to the right. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={displayName}
        className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+90px)] z-[1100] animate-slide-up overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-6 md:right-6 md:max-w-md"
        style={{ maxHeight: "70dvh" }}
      >
        <div className="overflow-y-auto px-5 pb-5 pt-4" style={{ maxHeight: "70dvh" }}>
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold leading-tight text-foreground">
                {displayName}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {charger.operator && (
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xs font-medium ${networkBadgeClass(charger.operatorId)}`}
                  >
                    {charger.operator}
                  </span>
                )}
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: status.color }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: status.color }}
                  />
                  {t(status.labelKey)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={t("close")}
              className="-mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 2-col stats grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {/* Max power */}
            <div className="rounded-xl border border-border bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="size-3.5" />
                {t("max_power")}
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {charger.maxPowerKw != null ? `${charger.maxPowerKw} kW` : t("unknown_power")}
              </p>
            </div>

            {/* Connectors count */}
            <div className="rounded-xl border border-border bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {t("connectors_label")}
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">{totalConnectors}</p>
            </div>
          </div>

          {/* Connector type chips */}
          {charger.connectors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {charger.connectors.map((c, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  {c.type.toUpperCase()} ×{c.count}
                  {c.powerKw != null ? ` · ${c.powerKw} kW` : ""}
                </span>
              ))}
            </div>
          )}

          {/* Address */}
          {addressLine && (
            <p className="mt-3 text-xs text-muted-foreground">{addressLine}</p>
          )}
        </div>
      </div>
    </>
  );
}
