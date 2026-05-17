"use client";

import { Fan, Lock, Megaphone, Sparkles, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import type { CommandName } from "@/types/history";
import type { VehicleBrand, VehicleState } from "@/types/vehicle";

interface CommandPanelProps {
  vehicleId: string;
  brand: VehicleBrand;
  state: VehicleState | undefined;
}

export function CommandPanel({ vehicleId, brand, state }: CommandPanelProps) {
  const caps = useBrandCapabilities(brand);
  const { mutate, isPending, variables } = useVehicleCommand();

  function send(command: CommandName, args?: Record<string, unknown>) {
    mutate({ vehicleId, command, args });
  }

  const inFlight = (cmd: CommandName) =>
    isPending && variables?.command === cmd;

  const climateActive = state?.isClimateOn ?? false;
  const climateCmd: CommandName = climateActive ? "climate_off" : "climate_on";
  const lockCmd: CommandName = state?.isLocked === false ? "lock" : "unlock";

  const buttons = [
    caps.commands.lock && caps.commands.unlock && {
      cmd: lockCmd,
      label: lockCmd === "lock" ? "Lock" : "Unlock",
      icon: lockCmd === "lock" ? Lock : Unlock,
      inFlight: inFlight("lock") || inFlight("unlock"),
    },
    caps.commands.climateOn && caps.commands.climateOff && {
      cmd: climateCmd,
      label: climateActive ? "Climate off" : "Climate on",
      icon: Fan,
      inFlight: inFlight("climate_on") || inFlight("climate_off"),
    },
    caps.commands.honk && {
      cmd: "honk" as CommandName,
      label: "Honk",
      icon: Megaphone,
      inFlight: inFlight("honk"),
    },
    caps.commands.flash && {
      cmd: "flash" as CommandName,
      label: "Flash",
      icon: Sparkles,
      inFlight: inFlight("flash"),
    },
  ].filter(Boolean) as { cmd: CommandName; label: string; icon: React.ComponentType<{ className?: string }>; inFlight: boolean }[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick commands</CardTitle>
      </CardHeader>
      <CardContent>
        {buttons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No commands available for this vehicle.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {buttons.map(({ cmd, label, icon: Icon, inFlight: fly }) => (
              <Button
                key={cmd}
                variant="outline"
                size="lg"
                onClick={() => send(cmd)}
                disabled={isPending || !state}
                className="h-20 flex-col gap-1"
              >
                <Icon className="size-5" />
                <span className="text-xs">{label}</span>
                {fly && (
                  <span className="text-[10px] text-muted-foreground">sending…</span>
                )}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
