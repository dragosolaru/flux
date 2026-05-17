"use client";

import { Camera, Shield, ShieldOff } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showSentry && (
          <div className="flex items-center gap-2">
            {isSentryMode ? (
              <Shield className="size-4 text-chart-2" />
            ) : (
              <ShieldOff className="size-4 text-muted-foreground" />
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
            <Camera
              className={cn(
                "size-4",
                isDashcamRecording ? "text-destructive" : "text-muted-foreground",
              )}
            />
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
      </CardContent>
    </Card>
  );
}
