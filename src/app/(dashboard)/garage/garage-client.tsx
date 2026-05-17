"use client";

import { PlusCircle } from "lucide-react";

import { AddVehicleModal } from "@/components/onboarding/AddVehicleModal";
import { VehicleListCard } from "@/components/vehicle/VehicleListCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useVehicles } from "@/hooks/useVehicles";

export function GarageClient() {
  const { data: vehicles, isLoading } = useVehicles();

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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : vehicles && vehicles.length > 0 ? (
        <div className="space-y-3">
          {vehicles.map((v) => (
            <VehicleListCard key={v.id} vehicle={v} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <div className="text-4xl">🚗</div>
          <div>
            <p className="font-medium">No vehicles in your garage</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a mock vehicle to explore the platform.
            </p>
          </div>
          <AddVehicleModal
            trigger={
              <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <PlusCircle className="size-4" />
                Add your first vehicle
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}
