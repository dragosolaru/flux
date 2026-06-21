"use client";

import { motion } from "framer-motion";
import { MapPin, Navigation, Plug, X, Zap } from "lucide-react";
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

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
};

export function ChargerDetailSheet({ charger, onClose }: ChargerDetailSheetProps) {
  const t = useTranslations("chargingMap");
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);

  const displayName = charger.name ?? charger.operator ?? t("station_fallback");
  const totalConnectors = charger.connectors.reduce((sum, c) => sum + c.count, 0);
  const status = STATUS_META[charger.availability];
  const isLive = charger.availability === "operational";

  const { street, postcode, city, region } = charger.address;
  const cityLine = [postcode, city].filter(Boolean).join(" ");
  const addressLines = [street, cityLine, region].filter(
    (line): line is string => Boolean(line && line.trim()),
  );

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${charger.lat},${charger.lng}`;

  return (
    <>
      {/* Backdrop — tap to dismiss. A proper scrim so the dimmed map (or the
          expanded explore sheet behind) reads as intentional, not a void. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[1090] bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating card — hugs its content and sits clear above the BottomNav, so
          there's no dead space below it. On md+ it anchors to the right. */}
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={displayName}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+90px)] z-[1100] overflow-hidden rounded-3xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-6 md:right-6 md:max-w-md"
        style={{ maxHeight: "72dvh" }}
      >
        {/* Top energy accent — a thin gradient bar gives the card an
            "electric" edge instead of a flat border. */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-teal-400 to-fuchsia-500" />

        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="overflow-y-auto px-5 pb-5 pt-4"
          style={{ maxHeight: "calc(72dvh - 4px)" }}
        >
          {/* Header */}
          <motion.div variants={item} className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-tight text-foreground">
                {displayName}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {charger.operator && (
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xs font-medium ${networkBadgeClass(charger.operatorId)}`}
                  >
                    {charger.operator}
                  </span>
                )}
                <span
                  className="flex items-center gap-1.5 text-xs font-medium"
                  style={{ color: status.color }}
                >
                  <span className="relative flex size-1.5">
                    {isLive && (
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                        style={{ backgroundColor: status.color }}
                      />
                    )}
                    <span
                      className="relative inline-flex size-1.5 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />
                  </span>
                  {t(status.labelKey)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={t("close")}
              className="-mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </motion.div>

          {/* Stats grid — power is the hero stat. */}
          <motion.div variants={item} className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="size-3.5 text-primary" />
                {t("max_power")}
              </div>
              <p className="mt-1 bg-gradient-to-r from-primary to-teal-400 bg-clip-text text-2xl font-bold text-transparent">
                {charger.maxPowerKw != null ? `${charger.maxPowerKw} kW` : t("unknown_power")}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/40 p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Plug className="size-3.5" />
                {t("connectors_label")}
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">{totalConnectors}</p>
            </div>
          </motion.div>

          {/* Connector type chips */}
          {charger.connectors.length > 0 && (
            <motion.div variants={item} className="mt-3 flex flex-wrap gap-1.5">
              {charger.connectors.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  <Zap className="size-3 text-primary/70" />
                  {c.type.toUpperCase()} ×{c.count}
                  {c.powerKw != null ? ` · ${c.powerKw} kW` : ""}
                </span>
              ))}
            </motion.div>
          )}

          {/* Address */}
          <motion.div variants={item} className="mt-4 flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 text-sm leading-snug text-foreground">
              {addressLines.length > 0 ? (
                addressLines.map((line) => (
                  <p key={line} className="truncate">
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">{t("address_unknown")}</p>
              )}
            </div>
          </motion.div>

          {/* Primary action — get directions. */}
          <motion.a
            variants={item}
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Navigation className="size-4" />
            {t("directions")}
          </motion.a>

          {/* Estimated availability disclaimer */}
          <motion.p
            variants={item}
            className="mt-3 text-[10px] leading-snug text-muted-foreground/60"
          >
            {t("availability_estimated")}
          </motion.p>
        </motion.div>
      </motion.div>
    </>
  );
}
