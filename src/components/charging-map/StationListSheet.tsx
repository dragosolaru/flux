"use client";

import { useEffect } from "react";
import { Search, X, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Charger, ChargerAvailability } from "@/lib/chargers/types";

interface StationListSheetProps {
  stations: Charger[];
  center: { lat: number; lng: number };
  query: string;
  onQueryChange: (q: string) => void;
  searching: boolean;
  onSelect: (s: Charger) => void;
  onClose: () => void;
}

const STATUS_COLOR: Record<ChargerAvailability, string> = {
  operational: "#22c55e",
  offline: "#f87171",
  stale: "#f59e0b",
  unknown: "#9ca3af",
};

// Great-circle distance in metres (small inline copy — no need to import dedup).
function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function StationListSheet({
  stations,
  center,
  query,
  onQueryChange,
  searching,
  onSelect,
  onClose,
}: StationListSheetProps) {
  const t = useTranslations("chargingMap");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Grouped by site before sorting. A site with several stalls arrives from the
  // API as several chargers with the same name, coordinates and power — correct
  // data, and a list that reads as broken: "iHunt · 110 m · 200 kW" twice in a
  // row, then Renovatio twice, then iHunt again. Reported from the car.
  //
  // Three decimals of latitude is about 100 m: one car park, not the next
  // operator down the road. The survivor is the strongest stall at the site
  // rather than whichever the query happened to return first.
  const sorted = Object.values(
    [...stations]
      .map((s) => ({ s, d: distanceM(center, { lat: s.lat, lng: s.lng }), points: 1 }))
      .reduce<Record<string, { s: Charger; d: number; points: number }>>((sites, entry) => {
        const key = `${entry.s.name ?? "?"}|${entry.s.lat.toFixed(3)}|${entry.s.lng.toFixed(3)}`;
        const seen = sites[key];
        if (!seen) {
          sites[key] = entry;
          return sites;
        }
        seen.points += 1;
        const better =
          (entry.s.maxPowerKw ?? 0) > (seen.s.maxPowerKw ?? 0) ||
          ((entry.s.maxPowerKw ?? 0) === (seen.s.maxPowerKw ?? 0) &&
            entry.s.confidence > seen.s.confidence);
        if (better) {
          seen.s = entry.s;
          seen.d = entry.d;
        }
        return sites;
      }, {}),
  ).sort((a, b) => a.d - b.d);

  const isSearch = query.trim().length >= 2;

  return (
    <>
      <div
        className="absolute inset-0 z-[1500] bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("nearby_title")}
        className="absolute bottom-0 left-0 right-0 z-[1600] flex flex-col rounded-t-3xl border-t border-border bg-card/95 shadow-xl backdrop-blur-xl"
        style={{ maxHeight: "75dvh" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Search row */}
        <div className="flex items-center gap-2 px-4 pb-3 pt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("search_placeholder")}
              aria-label={t("search_placeholder")}
              className="w-full rounded-full border border-border bg-muted/70 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-4 pb-1 text-xs font-medium text-muted-foreground">
          {isSearch ? t("search_results_title") : t("nearby_title")}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1">
          {searching && sorted.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : sorted.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("no_results")}</p>
          ) : (
            <ul className="space-y-1">
              {sorted.map(({ s, d, points }) => (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-muted"
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: STATUS_COLOR[s.availability] }}
                    >
                      {s.operator?.trim()?.[0]?.toUpperCase() ?? <Zap className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {s.name ?? s.operator ?? t("station_fallback")}
                        {points > 1 && (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            · {t("points_count", { count: points })}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          s.maxPowerKw != null ? `${Math.round(s.maxPowerKw)} kW` : null,
                          s.connectors.length > 0
                            ? s.connectors.map((c) => c.type.toUpperCase()).join(" · ")
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" — ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {d >= 1000
                        ? t("distance_km", { km: (d / 1000).toFixed(1) })
                        : t("distance_m", { m: Math.round(d) })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
