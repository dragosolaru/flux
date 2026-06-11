"use client";

import { Camera, Shield, ShieldOff } from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

interface SentryDashcamCardProps {
  isSentryMode: boolean | null;
  isDashcamRecording: boolean | null;
  showSentry: boolean;
  showDashcam: boolean;
}

export function SentryDashcamCard({
  isSentryMode,
  isDashcamRecording,
  showSentry,
  showDashcam,
}: SentryDashcamCardProps) {
  if (!showSentry && !showDashcam) return null;

  return (
    <GlassCard>
      <div className="p-4 space-y-3">
        <span className="text-xs tracking-[0.12em] uppercase text-muted-foreground/70">
          Security
        </span>
        {showSentry && (
          <div className="flex items-center gap-2">
            {isSentryMode ? (
              <Shield className="size-4 text-muted-foreground shrink-0" />
            ) : (
              <ShieldOff className="size-4 text-muted-foreground shrink-0" />
            )}
            <span
              className={cn(
                "text-sm font-medium",
                isSentryMode ? "text-chart-2" : "text-muted-foreground",
              )}
            >
              Sentry {isSentryMode ? "Active" : "Off"}
            </span>
          </div>
        )}
        {showDashcam && (
          <div className="flex items-center gap-2">
            <Camera className="size-4 text-muted-foreground shrink-0" />
            <span
              className={cn(
                "text-sm font-medium",
                isDashcamRecording ? "text-destructive" : "text-muted-foreground",
              )}
            >
              Dashcam {isDashcamRecording ? "Recording" : "Off"}
            </span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
