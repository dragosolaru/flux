"use client";

import { PlusCircle, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { AddVehicleModal } from "@/components/onboarding/AddVehicleModal";
import { FleetTotalsCard } from "@/components/garage/FleetTotalsCard";
import { WhichCarCard } from "@/components/garage/WhichCarCard";
import { VehicleListCard } from "@/components/vehicle/VehicleListCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useVehicles } from "@/hooks/useVehicles";
import { apiFetch } from "@/lib/api-fetch";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

export function GarageClient() {
  const { data: vehicles, isLoading } = useVehicles();
  const qc = useQueryClient();
  const { data: tariff } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => apiFetch<TariffResponse>("/api/tariffs/prices"),
    staleTime: 5 * 60 * 1000,
  });

  const seedDemo = useMutation({
    mutationFn: () =>
      apiFetch<{ created: string[]; skipped: string[]; total: number }>(
        "/api/seed-demo",
        { method: "POST" },
      ),
    onSuccess: (data) => {
      if (data.created.length > 0) {
        toast.success(`Added ${data.created.length} demo vehicles`);
      } else {
        toast.info("Demo vehicles already exist");
      }
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to seed demo");
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Garage</h1>
          <p className="text-sm text-muted-foreground">
            {vehicles?.length
              ? `${vehicles.length} vehicle${vehicles.length > 1 ? "s" : ""}`
              : "No vehicles yet"}
          </p>
        </div>
        <AddVehicleModal />
      </div>

      {/* Cheapest tariff window hint */}
      {tariff && tariff.cheapestAvgPrice < tariff.currentPrice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 px-3 py-2 text-sm text-chart-2">
          <Zap className="size-3.5 shrink-0" />
          <span>
            Cheapest plug-in:{" "}
            <strong>
              {String(tariff.cheapestWindowStart).padStart(2, "0")}:00
              {" – "}
              {String(tariff.cheapestWindowEnd).padStart(2, "0")}:00
            </strong>
            {" · "}save {((tariff.currentPrice - tariff.cheapestAvgPrice) * 100).toFixed(1)} ct/kWh vs now
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : vehicles && vehicles.length > 0 ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {vehicles.map((v) => (
              <VehicleListCard key={v.id} vehicle={v} />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <FleetTotalsCard vehicles={vehicles} />
            <WhichCarCard vehicles={vehicles} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <div className="text-4xl">🚗</div>
          <div>
            <p className="font-medium">No vehicles in your garage</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first vehicle or seed 3 demo vehicles to explore the platform.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <AddVehicleModal
              trigger={
                <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <PlusCircle className="size-4" />
                  Add a vehicle
                </button>
              }
            />
            <button
              onClick={() => seedDemo.mutate()}
              disabled={seedDemo.isPending}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {seedDemo.isPending ? "Seeding…" : "Seed 3 demo vehicles"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
