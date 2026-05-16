"use client";

import { Fan, Lock, Megaphone, Sparkles, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import type { TeslaCommand } from "@/types/tesla";
import type { VehicleState } from "@/types/vehicle";

interface CommandPanelProps {
  vehicleId: string;
  state: VehicleState | undefined;
}

export function CommandPanel({ vehicleId, state }: CommandPanelProps) {
  const { mutate, isPending, variables } = useVehicleCommand();

  function send(command: TeslaCommand) {
    mutate({ vehicleId, command });
  }

  const inFlight = (cmd: TeslaCommand) =>
    isPending && variables?.command === cmd;

  const climateActive = state?.isClimateOn ?? false;
  const climateCmd: TeslaCommand = climateActive
    ? "auto_conditioning_stop"
    : "auto_conditioning_start";

  const lockCmd: TeslaCommand =
    state?.isLocked === false ? "door_lock" : "door_unlock";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick commands</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => send(lockCmd)}
            disabled={isPending || !state}
            className="h-20 flex-col gap-1"
          >
            {lockCmd === "door_lock" ? (
              <Lock className="size-5" />
            ) : (
              <Unlock className="size-5" />
            )}
            <span className="text-xs">
              {lockCmd === "door_lock" ? "Lock" : "Unlock"}
            </span>
            {(inFlight("door_lock") || inFlight("door_unlock")) && (
              <span className="text-[10px] text-muted-foreground">
                sending…
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => send(climateCmd)}
            disabled={isPending || !state}
            className="h-20 flex-col gap-1"
          >
            <Fan className="size-5" />
            <span className="text-xs">
              {climateActive ? "Climate off" : "Climate on"}
            </span>
            {(inFlight("auto_conditioning_start") ||
              inFlight("auto_conditioning_stop")) && (
              <span className="text-[10px] text-muted-foreground">
                sending…
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => send("honk_horn")}
            disabled={isPending || !state}
            className="h-20 flex-col gap-1"
          >
            <Megaphone className="size-5" />
            <span className="text-xs">Honk</span>
            {inFlight("honk_horn") && (
              <span className="text-[10px] text-muted-foreground">
                sending…
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => send("flash_lights")}
            disabled={isPending || !state}
            className="h-20 flex-col gap-1"
          >
            <Sparkles className="size-5" />
            <span className="text-xs">Flash</span>
            {inFlight("flash_lights") && (
              <span className="text-[10px] text-muted-foreground">
                sending…
              </span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
