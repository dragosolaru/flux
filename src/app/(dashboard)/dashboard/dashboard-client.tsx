"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChargingStatus } from "@/components/charging/ChargingStatus";
import { CommandPanel } from "@/components/vehicle/CommandPanel";
import { StatsGrid } from "@/components/vehicle/StatsGrid";
import { VehicleCard } from "@/components/vehicle/VehicleCard";
import { useVehicle } from "@/hooks/useVehicle";

interface DashboardClientProps {
  vehicleId: string;
  vehicleName: string;
}

export function DashboardClient({
  vehicleId,
  vehicleName,
}: DashboardClientProps) {
  const { data, isLoading, isFetching, error, refetch } = useVehicle(vehicleId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {vehicleName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Live state from the Tesla Fleet API · refreshes every 30s
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`size-4 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <div>
              <div className="font-medium">Couldn&apos;t reach your vehicle</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
            <Button onClick={() => refetch()}>Try again</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <VehicleCard state={data} isLoading={isLoading} />
          {data && <StatsGrid state={data} />}
          <div className="grid gap-4 md:grid-cols-2">
            <ChargingStatus state={data} isLoading={isLoading} />
            <CommandPanel vehicleId={vehicleId} state={data} />
          </div>
        </>
      )}
    </div>
  );
}
