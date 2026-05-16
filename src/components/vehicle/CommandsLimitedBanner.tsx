"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CommandsLimitedBannerProps {
  domain: string;
}

export function CommandsLimitedBanner({ domain }: CommandsLimitedBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const virtualKeyUrl = `https://www.tesla.com/_ak/${domain}`;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-chart-4/40 bg-chart-4/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-4" />
      <div className="flex-1 space-y-1">
        <div className="font-medium">
          Commands are read-only on this car for now
        </div>
        <p className="text-muted-foreground">
          Tesla deprecated REST commands on Model 3/Y/S/X built after 2021.
          Lock, climate, horn, flash, and charge limit need the Tesla Vehicle
          Command Protocol — signed commands routed through a proxy you
          control. We&apos;ll wire it up next. Until then, dashboard reads
          (battery, range, location) work normally.
        </p>
        <p className="text-muted-foreground">
          When ready, pair Flux as a Virtual Key on your phone:{" "}
          <a
            href={virtualKeyUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline"
          >
            {virtualKeyUrl}
          </a>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="size-7"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
