"use client";

import { CalendarClock, CheckCircle2, Thermometer, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";

interface DepartureCardProps {
  vehicleId: string;
}

export function DepartureCard({ vehicleId }: DepartureCardProps) {
  const t = useTranslations("departure");
  const { mutate, isPending, variables } = useVehicleCommand();

  const [departureTime, setDepartureTime] = useState("08:00");
  const [scheduledConfirm, setScheduledConfirm] = useState(false);
  const [precondConfirm, setPrecondConfirm] = useState(false);

  const inFlight = (cmd: string) => isPending && variables?.command === cmd;

  function handleScheduleDeparture() {
    const [h, m] = departureTime.split(":").map(Number);
    const minutes = (h ?? 8) * 60 + (m ?? 0);
    mutate(
      { vehicleId, command: "schedule_departure", args: { time: minutes } },
      {
        onSuccess: () => {
          setScheduledConfirm(true);
          setTimeout(() => setScheduledConfirm(false), 8_000);
        },
      },
    );
  }

  function handlePreconditionNow() {
    mutate(
      { vehicleId, command: "precondition_max", args: { on: true } },
      {
        onSuccess: () => {
          setPrecondConfirm(true);
          setTimeout(() => setPrecondConfirm(false), 8_000);
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scheduled departure */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("departure_label")}
          </p>
          <p className="text-xs text-muted-foreground">{t("departure_hint")}</p>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              variant={scheduledConfirm ? "default" : "outline"}
              size="sm"
              onClick={handleScheduleDeparture}
              disabled={isPending || scheduledConfirm}
              className="min-w-28"
            >
              {scheduledConfirm ? (
                <><CheckCircle2 className="size-3.5 mr-1.5" />{t("scheduled")}</>
              ) : inFlight("schedule_departure") ? (
                t("scheduling")
              ) : (
                <><Zap className="size-3.5 mr-1.5" />{t("schedule_btn")}</>
              )}
            </Button>
          </div>
        </div>

        <div className="border-t" />

        {/* Precondition now */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("precondition_label")}
          </p>
          <p className="text-xs text-muted-foreground">{t("precondition_hint")}</p>
          <Button
            variant={precondConfirm ? "default" : "outline"}
            size="sm"
            onClick={handlePreconditionNow}
            disabled={isPending || precondConfirm}
            className="min-w-40"
          >
            {precondConfirm ? (
              <><CheckCircle2 className="size-3.5 mr-1.5" />{t("preconditioned")}</>
            ) : inFlight("precondition_max") ? (
              t("preconditioning")
            ) : (
              <><Thermometer className="size-3.5 mr-1.5" />{t("precondition_btn")}</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
