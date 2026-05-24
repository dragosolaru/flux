"use client";

import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Button } from "@/components/ui/button";
import { MockChip } from "./MockChip";
import { VehicleModelImage } from "./VehicleModelImage";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import { useVirtualKeyPair } from "@/hooks/useVirtualKeyPair";
import type { VehicleListItem } from "@/hooks/useVehicles";

const BRAND_COLORS: Record<string, string> = {
  tesla: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const BRAND_LABEL: Record<string, string> = {
  tesla: "Tesla",
};

interface VehicleListCardProps {
  vehicle: VehicleListItem;
}

export function VehicleListCard({ vehicle }: VehicleListCardProps) {
  const colorClass = BRAND_COLORS[vehicle.brand] ?? "bg-muted text-muted-foreground";
  const brandLabel = BRAND_LABEL[vehicle.brand] ?? vehicle.brand;
  const [confirming, setConfirming] = useState(false);
  const qc = useQueryClient();
  const virtualKeyPair = useVirtualKeyPair(vehicle.id);

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/vehicles/${vehicle.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`${vehicle.nickname ?? vehicle.displayName} removed`);
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: () => toast.error("Failed to remove vehicle"),
  });

  if (confirming) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center gap-4 p-5">
          <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", colorClass)}>
            <BrandLogo brand={vehicle.brand} className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Remove {vehicle.nickname ?? vehicle.displayName}?</p>
            <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="group relative">
      <Link href={`/dashboard?v=${vehicle.id}`} className="block">
        <Card className="transition-shadow group-hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-5">
            <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold", colorClass)}>
              {brandLabel[0]}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">
                  {vehicle.nickname ?? vehicle.displayName}
                </span>
                {vehicle.dataSource === "mock" && <MockChip />}
              </div>
              <div className="mt-0.5 truncate text-sm text-muted-foreground">
                {[brandLabel, vehicle.model, vehicle.year].filter(Boolean).join(" · ")}
              </div>
              {vehicle.dataSource === "live" && (
                <div className="mt-1">
                  {vehicle.virtualKeyPaired ? (
                    <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                      Virtual Key ✓
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto px-2 py-0.5 text-xs"
                      disabled={virtualKeyPair.isPending}
                      onClick={(e: MouseEvent<HTMLButtonElement>) => {
                        e.preventDefault();
                        virtualKeyPair.mutate(true);
                      }}
                    >
                      Mark Virtual Key as paired
                    </Button>
                  )}
                </div>
              )}
            </div>

            {vehicle.model && (
              <VehicleModelImage
                model={vehicle.model}
                className="hidden w-[80px] shrink-0 text-muted-foreground/35 sm:block"
              />
            )}

            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </CardContent>
        </Card>
      </Link>

      {/* Delete button — sits on top of the card, outside the Link */}
      <button
        onClick={(e: MouseEvent<HTMLButtonElement>) => { e.preventDefault(); setConfirming(true); }}
        className="absolute right-12 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        aria-label={`Remove ${vehicle.nickname ?? vehicle.displayName}`}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
