"use client";

import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  stationReliability,
  daysSinceVerified,
} from "@/lib/external/routing/reliability";

interface ReliabilityBadgeProps {
  station: { isOperational?: boolean; lastVerifiedAt?: string };
}

export function ReliabilityBadge({ station }: ReliabilityBadgeProps) {
  const t = useTranslations("trip.reliability");
  const level = stationReliability(station);

  if (level === "unknown") return null;

  if (level === "offline") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-500">
        <ShieldAlert className="size-3" />
        {t("offline")}
      </span>
    );
  }

  if (level === "stale") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-500">
        <ShieldAlert className="size-3" />
        {t("stale")}
      </span>
    );
  }

  const days = station.lastVerifiedAt ? daysSinceVerified(station.lastVerifiedAt) : 0;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-green-500/15 px-1.5 py-0.5 text-[11px] font-medium text-green-500">
      <ShieldCheck className="size-3" />
      {t("verified", { days })}
    </span>
  );
}
