"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BatteryHealthCard } from "@/components/vehicle/BatteryHealthCard";
import { BatteryDegradationChart } from "@/components/vehicle/BatteryDegradationChart";
import { ChargingStatus } from "@/components/charging/ChargingStatus";
import { CommandPanel } from "@/components/vehicle/CommandPanel";
import { DepartureCard } from "@/components/vehicle/DepartureCard";
import { FeatureGate } from "@/components/layout/FeatureGate";
import { DoorsWindowsCard } from "@/components/vehicle/DoorsWindowsCard";
import { ScoresCard } from "@/components/vehicle/ScoresCard";
import { SentryDashcamCard } from "@/components/vehicle/SentryDashcamCard";
import { SoftwareCard } from "@/components/vehicle/SoftwareCard";
import { StatsGrid } from "@/components/vehicle/StatsGrid";
import { TirePressureCard } from "@/components/vehicle/TirePressureCard";
import { VehicleCard } from "@/components/vehicle/VehicleCard";
import { WeatherRangeCard } from "@/components/vehicle/WeatherRangeCard";
import { useVehicle } from "@/hooks/useVehicle";
import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { VehicleNotifications } from "@/components/notifications/VehicleNotifications";
import type { BrandKey } from "@/lib/brands/types";

interface DashboardClientProps {
  vehicleId: string;
  vehicleName: string;
  brand: BrandKey;
  model?: string;
}

export function DashboardClient({ vehicleId, vehicleName, brand, model }: DashboardClientProps) {
  const { data, isLoading, isFetching, isError, error, refetch } = useVehicle(vehicleId);
  const caps = useBrandCapabilities(brand);
  const t = caps?.telemetry;
  const td = useTranslations("dashboard");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <VehicleNotifications vehicleId={vehicleId} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{vehicleName}</h1>
          <p className="text-sm text-muted-foreground">
            {data?.dataSource === "live" ? (
              <><span className="font-medium text-chart-2">{td("live_label")}</span> · {td("live_subtitle")}</>
            ) : (
              td("demo_subtitle")
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          {td("refresh")}
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <div>
              <div className="font-medium">{td("error_title")}</div>
              <p className="mt-1 text-sm text-muted-foreground">{td("error_subtitle")}</p>
            </div>
            <Button onClick={() => refetch()}>{td("retry")}</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <VehicleCard state={data} isLoading={isLoading} model={model} />
          {data && <StatsGrid state={data} />}

          <div className="grid gap-4 md:grid-cols-2">
            <ChargingStatus state={data} isLoading={isLoading} isError={isError} />
            <FeatureGate capability="COMMANDS" fallback="null">
              <CommandPanel vehicleId={vehicleId} brand={brand} state={data} />
            </FeatureGate>
          </div>

          <FeatureGate capability="LIVE" fallback="null">
            <DepartureCard vehicleId={vehicleId} />
          </FeatureGate>

          {/* Extended telemetry — each section gated on brand capability */}
          {/* Weather + derated range */}
          <div className="grid gap-4 sm:grid-cols-2">
            <WeatherRangeCard vehicleId={vehicleId} />
          </div>

          {data && t && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {t.tirePressure && data.tirePressures && (
                <TirePressureCard tirePressures={data.tirePressures} />
              )}

              {(t.doorsOpen || t.windowsOpen || t.trunkOpen || t.frunkOpen) && (
                <DoorsWindowsCard
                  doorsOpen={t.doorsOpen ? data.doorsOpen : null}
                  windowsOpen={t.windowsOpen ? data.windowsOpen : null}
                  isTrunkOpen={t.trunkOpen ? data.isTrunkOpen : null}
                  isFrunkOpen={t.frunkOpen ? data.isFrunkOpen : null}
                />
              )}

              {(t.sentryMode || t.dashcam) && (
                <SentryDashcamCard
                  isSentryMode={data.isSentryMode}
                  isDashcamRecording={data.isDashcamRecording}
                  showSentry={t.sentryMode}
                  showDashcam={t.dashcam}
                />
              )}

              {(t.batteryHealthPct || t.cellVoltages) && (
                <BatteryHealthCard
                  batteryHealthPct={data.batteryHealthPct}
                  cellVoltages={data.cellVoltages}
                  showCells={t.cellVoltages}
                />
              )}

              {t.batteryHealthPct && (
                <FeatureGate capability="PRO" fallback="null">
                  <BatteryDegradationChart vehicleId={vehicleId} />
                </FeatureGate>
              )}

              {t.softwareVersion && (
                <SoftwareCard
                  softwareVersion={data.softwareVersion}
                  updateAvailable={data.updateAvailable}
                  updateVersionLabel={data.updateVersionLabel}
                />
              )}

              {(t.safetyScore || t.efficiencyScore) && (
                <ScoresCard
                  safetyScore={data.safetyScore}
                  efficiencyScore={data.efficiencyScore}
                  showSafety={t.safetyScore}
                  showEfficiency={t.efficiencyScore}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
