"use client";

import { DoorOpen } from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
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
    <GlassCard>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <DoorOpen className="size-4 text-muted-foreground shrink-0" />
          <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground/50">
            Doors &amp; Windows
          </span>
        </div>
        {allSecure ? (
          <p className="text-sm font-medium text-chart-2">All closed</p>
        ) : (
          <>
            {doorsOpen && (
              <div>
                <p className="mb-1.5 text-[10px] tracking-[0.12em] uppercase text-muted-foreground/50">Doors</p>
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
                <p className="mb-1.5 text-[10px] tracking-[0.12em] uppercase text-muted-foreground/50">Windows</p>
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
              <div className="text-xs text-muted-foreground">Trunk: closed</div>
            )}
            {isFrunkOpen != null && (
              <div className="text-xs text-muted-foreground">Frunk: closed</div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
