"use client";

import type { ComponentType } from "react";
import { Star, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function ScoreRing({ score, label, icon: Icon }: {
  score: number;
  label: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const color =
    score >= 85 ? "text-chart-2" : score >= 70 ? "text-yellow-500" : "text-destructive";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("text-2xl font-semibold tabular-nums", color)}>{score}</div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
    </div>
  );
}

interface ScoresCardProps {
  safetyScore: number | null;
  efficiencyScore: number | null;
  showSafety: boolean;
  showEfficiency: boolean;
}

export function ScoresCard({
  safetyScore,
  efficiencyScore,
  showSafety,
  showEfficiency,
}: ScoresCardProps) {
  if (!showSafety && !showEfficiency) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Scores
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-8">
          {showSafety && safetyScore != null && (
            <ScoreRing score={safetyScore} label="Safety" icon={Star} />
          )}
          {showEfficiency && efficiencyScore != null && (
            <ScoreRing score={efficiencyScore} label="Efficiency" icon={Zap} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
