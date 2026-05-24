"use client";

import { useState, type ChangeEvent } from "react";

import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChargingStatus } from "@/components/charging/ChargingStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useChargingHistorySync } from "@/hooks/useChargingHistorySync";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";

interface HistoryRow {
  id: string;
  batteryLevel: number | null;
  chargingRateKw: number | null;
  recordedAt: string;
}

interface ChargingClientProps {
  vehicleId: string;
  vehicleName: string;
  history: HistoryRow[];
}

export function ChargingClient({
  vehicleId,
  vehicleName,
  history,
}: ChargingClientProps) {
  const { data, isLoading } = useVehicle(vehicleId);
  const { mutate, isPending } = useVehicleCommand();
  const { data: caps } = useCapabilities();
  const syncMutation = useChargingHistorySync(vehicleId);

  const [limit, setLimit] = useState<number>(data?.chargeLimit ?? 80);
  const [scheduled, setScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("23:00");

  const effectiveLimit = data?.chargeLimit ?? limit;

  function saveChargeLimit() {
    mutate({
      vehicleId,
      command: "set_charge_limit",
      args: { limitPct: limit },
    });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Charging</h1>
        <p className="text-sm text-muted-foreground">{vehicleName}</p>
      </div>

      <ChargingStatus state={data} isLoading={isLoading} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Charge limit</CardTitle>
          <CardDescription>
            Set the maximum state-of-charge. Tesla recommends ≤90% for daily
            use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !data ? (
            <Skeleton className="h-6 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Limit</span>
                <span className="text-base font-medium tabular-nums">
                  {limit}%
                </span>
              </div>
              <Slider
                value={[limit]}
                onValueChange={(v: number[]) => setLimit(v[0] ?? effectiveLimit)}
                min={50}
                max={100}
                step={1}
              />
              <Button
                onClick={saveChargeLimit}
                disabled={isPending || limit === data.chargeLimit}
                className="w-full sm:w-auto"
              >
                {isPending ? "Saving…" : "Save limit"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled charging</CardTitle>
          <CardDescription>
            Start charging at a chosen time — useful for off-peak tariffs.
            Coming soon: persisted server-side schedules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Enabled</span>
            <Switch checked={scheduled} onCheckedChange={setScheduled} />
          </div>
          {scheduled && (
            <div className="flex items-center gap-3">
              <label htmlFor="time" className="text-sm text-muted-foreground">
                Start at
              </label>
              <input
                id="time"
                type="time"
                value={scheduleTime}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setScheduleTime(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent charging sessions</CardTitle>
              <CardDescription>
                Snapshots captured while charging was active.
              </CardDescription>
            </div>
            {caps?.hasLiveVehicle && (
              <Button
                variant="outline"
                size="sm"
                disabled={syncMutation.isPending}
                onClick={() => {
                  syncMutation.mutate(undefined, {
                    onSuccess: (result) => {
                      toast.success(`Synced ${result.synced} sessions`);
                    },
                  });
                }}
              >
                <RefreshCw
                  className={syncMutation.isPending ? "animate-spin" : ""}
                  size={14}
                />
                <span className="ml-1">
                  {syncMutation.isPending ? "Syncing…" : "Sync from Tesla"}
                </span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No charging history yet — once your car has been plugged in while
              the dashboard is open, sessions will appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="tabular-nums text-muted-foreground">
                    {new Date(row.recordedAt).toLocaleString()}
                  </span>
                  <span className="tabular-nums">
                    {row.batteryLevel ?? 0}% · {row.chargingRateKw ?? 0} kW
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
