"use client";

import type { ComponentType } from "react";
import { Star, Zap } from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
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
      <div className={cn("text-2xl font-light tabular-nums", color)}>{score}</div>
      <div className="flex items-center gap-1 text-xs tracking-[0.12em] uppercase text-muted-foreground/70">
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
    <GlassCard>
      <div className="p-4 space-y-3">
        <span className="text-xs tracking-[0.12em] uppercase text-muted-foreground/70">
          Scores
        </span>
        <div className="flex gap-8">
          {showSafety && safetyScore != null && (
            <ScoreRing score={safetyScore} label="Safety" icon={Star} />
          )}
          {showEfficiency && efficiencyScore != null && (
            <ScoreRing score={efficiencyScore} label="Efficiency" icon={Zap} />
          )}
        </div>
      </div>
    </GlassCard>
  );
}
