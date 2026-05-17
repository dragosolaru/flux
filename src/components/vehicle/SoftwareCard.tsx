"use client";

import { Cpu, Download } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          <Cpu className="size-3.5" />
          Software
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
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
      </CardContent>
    </Card>
  );
}
