"use client";

import { useState } from "react";
import { CheckCircle2, Flame, CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";

interface DepartureCardProps {
  vehicleId: string;
}

export function DepartureCard({ vehicleId }: DepartureCardProps) {
  const t = useTranslations("departure");
  const { mutate, isPending } = useVehicleCommand();

  const [departureTime, setDepartureTime] = useState("07:00");
  const [scheduledDone, setScheduledDone] = useState(false);
  const [preconditionDone, setPreconditionDone] = useState(false);

  function handleSchedule() {
    const [h, m] = departureTime.split(":").map(Number);
    const minutes = (h ?? 7) * 60 + (m ?? 0);
    mutate(
      { vehicleId, command: "schedule_departure", args: { time: minutes } },
      {
        onSuccess: (data) => {
          if (data.success) {
            setScheduledDone(true);
            setTimeout(() => setScheduledDone(false), 8_000);
          }
        },
      },
    );
  }

  function handlePrecondition() {
    mutate(
      { vehicleId, command: "precondition_max", args: { on: true } },
      {
        onSuccess: (data) => {
          if (data.success) {
            setPreconditionDone(true);
            setTimeout(() => setPreconditionDone(false), 8_000);
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-muted-foreground" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scheduled departure */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("departure_label")}</p>
          <p className="text-xs text-muted-foreground">{t("departure_hint")}</p>
          <div className="flex gap-2">
            <input
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSchedule}
              disabled={isPending || scheduledDone}
            >
              {scheduledDone ? (
                <><CheckCircle2 className="size-4 text-chart-2" /> {t("scheduled")}</>
              ) : isPending ? (
                t("scheduling")
              ) : (
                t("schedule_btn")
              )}
            </Button>
          </div>
        </div>

        <div className="border-t" />

        {/* Precondition now */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("precondition_label")}</p>
          <p className="text-xs text-muted-foreground">{t("precondition_hint")}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrecondition}
            disabled={isPending || preconditionDone}
          >
            {preconditionDone ? (
              <><CheckCircle2 className="size-4 text-chart-2" /> {t("preconditioned")}</>
            ) : isPending ? (
              t("preconditioning")
            ) : (
              <><Flame className="size-4" /> {t("precondition_btn")}</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
