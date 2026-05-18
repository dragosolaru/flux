"use client";

import { cn } from "@/lib/utils";

interface BatteryGaugeProps {
  level: number; // 0..100
  isCharging?: boolean;
  size?: number;
  className?: string;
}

export function BatteryGauge({
  level,
  isCharging = false,
  size = 220,
  className,
}: BatteryGaugeProps) {
  const clamped = Math.round(Math.max(0, Math.min(100, level)));
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * radius; // half circle
  const offset = circumference - (clamped / 100) * circumference;

  const color =
    clamped <= 15
      ? "text-destructive"
      : clamped <= 35
        ? "text-chart-4"
        : "text-chart-2";

  return (
    <div
      className={cn("relative inline-flex items-end justify-center", className)}
      style={{ width: size, height: size / 2 + 24 }}
      aria-label={`Battery ${clamped}%`}
      role="img"
    >
      <svg
        width={size}
        height={size / 2 + stroke}
        viewBox={`0 0 ${size} ${size / 2 + stroke}`}
        className="overflow-visible"
      >
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="text-muted/40"
        />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-700 ease-out", color)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <div className="text-5xl font-semibold tabular-nums">
          {clamped}
          <span className="ml-0.5 text-2xl text-muted-foreground">%</span>
        </div>
        {isCharging && (
          <div className="mt-1 text-xs uppercase tracking-wide text-chart-2">
            Charging
          </div>
        )}
      </div>
    </div>
  );
}
