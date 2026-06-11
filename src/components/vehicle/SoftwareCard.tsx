"use client";

import { Cpu, Download } from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";

interface SoftwareCardProps {
  softwareVersion: string | null;
  updateAvailable: boolean | null;
  updateVersionLabel: string | null;
}

export function SoftwareCard({
  softwareVersion,
  updateAvailable,
  updateVersionLabel,
}: SoftwareCardProps) {
  return (
    <GlassCard>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-muted-foreground shrink-0" />
          <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground/50">
            Software
          </span>
        </div>
        {softwareVersion && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{softwareVersion}</span>
            {updateAvailable && (
              <span className="inline-flex items-center gap-1 rounded-full border border-chart-2/30 bg-chart-2/10 px-2 py-0.5 text-xs font-medium text-chart-2">
                <Download className="size-3" />
                {updateVersionLabel ?? "Update available"}
              </span>
            )}
          </div>
        )}
        {updateAvailable === false && (
          <p className="text-xs text-muted-foreground">Up to date</p>
        )}
      </div>
    </GlassCard>
  );
}
