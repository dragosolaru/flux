"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VehicleListItem } from "@/hooks/useVehicles";

const BRAND_COLORS: Record<string, string> = {
  tesla:    "bg-red-500/15 text-red-600 dark:text-red-400",
  bmw:      "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  polestar: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  mercedes: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  vw:       "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  hyundai:  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  renault:  "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

const BRAND_LABEL: Record<string, string> = {
  tesla:    "Tesla",
  bmw:      "BMW",
  polestar: "Polestar",
  mercedes: "Mercedes-EQ",
  vw:       "VW ID",
  hyundai:  "Hyundai / Kia",
  renault:  "Renault",
};

interface VehicleListCardProps {
  vehicle: VehicleListItem;
}

export function VehicleListCard({ vehicle }: VehicleListCardProps) {
  const colorClass = BRAND_COLORS[vehicle.brand] ?? "bg-muted text-muted-foreground";
  const brandLabel = BRAND_LABEL[vehicle.brand] ?? vehicle.brand;

  return (
    <Link href={`/dashboard?v=${vehicle.id}`} className="group block">
      <Card className="transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-5">
          {/* Brand avatar */}
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold",
              colorClass,
            )}
          >
            {brandLabel[0]}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">
                {vehicle.nickname ?? vehicle.displayName}
              </span>
              {vehicle.dataSource === "mock" && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Mock
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-sm text-muted-foreground">
              {[brandLabel, vehicle.model, vehicle.year].filter(Boolean).join(" · ")}
            </div>
          </div>

          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </CardContent>
      </Card>
    </Link>
  );
}
