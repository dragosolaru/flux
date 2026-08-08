"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Car, Loader2, MapPin, Navigation, Plug, X, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Charger } from "@/lib/chargers/types";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useVehicles } from "@/hooks/useVehicles";
import * as vehiclesApi from "@/lib/api/vehicles";
import { needsPreconditioning, isTeslaOwnNetwork } from "@/lib/trip/precondition";

interface ChargerDetailSheetProps {
  charger: Charger;
  onClose: () => void;
}

function networkBadgeClass(operatorId: string | null): string {
  if (operatorId === "tesla") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (operatorId === "ionity") return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

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
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
};

export function ChargerDetailSheet({ charger, onClose }: ChargerDetailSheetProps) {
  const t = useTranslations("chargingMap");
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  const { data: vehicles } = useVehicles();
  const [sending, setSending] = useState(false);

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

  // Prefer a live-connected Tesla, fall back to any Tesla (demo) — the command
  // route handles both paths.
  const teslaVehicle = useMemo(() => {
    const teslas = (vehicles ?? []).filter((v) => v.brand === "tesla");
    return teslas.find((v) => v.dataSource === "live") ?? teslas[0] ?? null;
  }, [vehicles]);

  async function handleSendToCar() {
    if (!teslaVehicle) return;
    setSending(true);
    try {
      const isSupercharger = isTeslaOwnNetwork({ operatorId: charger.operatorId });
      const willPrecondition =
        needsPreconditioning(charger.maxPowerKw ?? 0) && !isSupercharger;

      await vehiclesApi.shareNavigation(
        teslaVehicle.id,
        { destination: { lat: charger.lat, lng: charger.lng, name: displayName } },
        { precondition: willPrecondition },
      );
      toast.success(
        willPrecondition ? t("send_to_car_preconditioned") : t("send_to_car_success"),
      );
    } catch {
      toast.error(t("send_to_car_error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[1090] bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={displayName}
        initial={{ opacity: 0, y: 20, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+90px)] z-[1100] overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-6 md:right-6 md:max-w-sm"
        style={{ maxHeight: "70dvh" }}
      >
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="overflow-y-auto px-4 pb-4 pt-3.5"
          style={{ maxHeight: "70dvh" }}
        >
          {/* Header */}
          <motion.div variants={item} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold leading-tight text-foreground">
                {displayName}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {charger.operator && (
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${networkBadgeClass(charger.operatorId)}`}
                  >
                    {charger.operator}
                  </span>
                )}
                <span
                  className="flex items-center gap-1 text-[11px] font-medium"
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
              className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </motion.div>

          {/* Compact stat row — power is the hero, no heavy boxes. */}
          <motion.div variants={item} className="mt-3 flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Zap className="size-3 text-primary" />
                {t("max_power")}
              </div>
              <p className="bg-gradient-to-r from-primary to-teal-400 bg-clip-text text-xl font-bold text-transparent">
                {charger.maxPowerKw != null ? `${charger.maxPowerKw} kW` : t("unknown_power")}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Plug className="size-3" />
                {t("connectors_label")}
              </div>
              <p className="text-xl font-bold text-foreground">{totalConnectors}</p>
            </div>
          </motion.div>

          {/* Connector type chips */}
          {charger.connectors.length > 0 && (
            <motion.div variants={item} className="mt-2.5 flex flex-wrap gap-1.5">
              {charger.connectors.map((c, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {c.type.toUpperCase()} ×{c.count}
                  {c.powerKw != null ? ` · ${c.powerKw} kW` : ""}
                </span>
              ))}
            </motion.div>
          )}

          {/* Address */}
          <motion.div variants={item} className="mt-3 flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 text-xs leading-snug text-muted-foreground">
              {addressLines.length > 0 ? (
                addressLines.map((line) => (
                  <p key={line} className="truncate">
                    {line}
                  </p>
                ))
              ) : (
                <p>{t("address_unknown")}</p>
              )}
            </div>
          </motion.div>

          {/* Actions */}
          <motion.div variants={item} className="mt-3.5 flex gap-2">
            {teslaVehicle ? (
              <>
                <button
                  onClick={handleSendToCar}
                  disabled={sending}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Car className="size-4" />
                  )}
                  {sending ? t("sending") : t("send_to_car")}
                </button>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("directions")}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Navigation className="size-4" />
                </a>
              </>
            ) : (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Navigation className="size-4" />
                {t("directions")}
              </a>
            )}
          </motion.div>

          {/* Disclaimer */}
          <motion.p
            variants={item}
            className="mt-2.5 text-[10px] leading-snug text-muted-foreground/60"
          >
            {t("availability_estimated")}
          </motion.p>
        </motion.div>
      </motion.div>
    </>
  );
}
