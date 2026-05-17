"use client";

import { DoorOpen, LayoutGrid } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DoorsState, WindowsState } from "@/types/vehicle";

function StatusDot({ open, label }: { open: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "size-2 rounded-full",
          open ? "bg-destructive" : "bg-chart-2",
        )}
      />
      <span className={cn(open ? "text-destructive" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}

interface DoorsWindowsCardProps {
  doorsOpen: DoorsState | null;
  windowsOpen: WindowsState | null;
  isTrunkOpen: boolean | null;
  isFrunkOpen: boolean | null;
}

export function DoorsWindowsCard({
  doorsOpen,
  windowsOpen,
  isTrunkOpen,
  isFrunkOpen,
}: DoorsWindowsCardProps) {
  const anyDoorOpen =
    doorsOpen &&
    (doorsOpen.frontLeft ||
      doorsOpen.frontRight ||
      doorsOpen.rearLeft ||
      doorsOpen.rearRight);
  const anyWindowOpen =
    windowsOpen &&
    (windowsOpen.frontLeft ||
      windowsOpen.frontRight ||
      windowsOpen.rearLeft ||
      windowsOpen.rearRight);

  const allSecure = !anyDoorOpen && !anyWindowOpen && !isTrunkOpen && !isFrunkOpen;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          <DoorOpen className="size-3.5" />
          Doors &amp; Windows
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {allSecure ? (
          <p className="text-sm font-medium text-chart-2">All closed</p>
        ) : (
          <>
            {doorsOpen && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Doors</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <StatusDot open={doorsOpen.frontLeft} label="FL" />
                  <StatusDot open={doorsOpen.frontRight} label="FR" />
                  <StatusDot open={doorsOpen.rearLeft} label="RL" />
                  <StatusDot open={doorsOpen.rearRight} label="RR" />
                </div>
              </div>
            )}
            {windowsOpen && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Windows</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <StatusDot open={windowsOpen.frontLeft} label="FL" />
                  <StatusDot open={windowsOpen.frontRight} label="FR" />
                  <StatusDot open={windowsOpen.rearLeft} label="RL" />
                  <StatusDot open={windowsOpen.rearRight} label="RR" />
                </div>
              </div>
            )}
            <div className="flex gap-4">
              {isTrunkOpen != null && (
                <StatusDot open={isTrunkOpen} label="Trunk" />
              )}
              {isFrunkOpen != null && (
                <StatusDot open={isFrunkOpen} label="Frunk" />
              )}
            </div>
          </>
        )}
        {allSecure && (isTrunkOpen != null || isFrunkOpen != null) && (
          <div className="flex gap-4">
            {isTrunkOpen != null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <LayoutGrid className="size-3" />
                Trunk: closed
              </div>
            )}
            {isFrunkOpen != null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <LayoutGrid className="size-3" />
                Frunk: closed
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
