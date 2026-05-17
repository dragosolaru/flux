"use client";

import type { HourlyPrice } from "@/lib/external/tariffs/types";

interface PriceCurveChartProps {
  prices: HourlyPrice[];
  currentHour: number;
  cheapestWindowStart: number;
  cheapestWindowEnd: number;
}

const HEIGHT = 120;
const BAR_GAP = 2;

export function PriceCurveChart({
  prices,
  currentHour,
  cheapestWindowStart,
  cheapestWindowEnd,
}: PriceCurveChartProps) {
  if (prices.length === 0) return null;

  const max = Math.max(...prices.map((p) => p.priceEurKwh));
  const min = Math.min(...prices.map((p) => p.priceEurKwh));
  const range = max - min || 1;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 480 ${HEIGHT + 28}`}
        className="w-full"
        aria-label="24-hour electricity price chart"
      >
        {prices.map((p, i) => {
          const barW = (480 - BAR_GAP * 23) / 24;
          const x = i * (barW + BAR_GAP);
          const barH = Math.max(4, ((p.priceEurKwh - min) / range) * HEIGHT * 0.85 + HEIGHT * 0.1);
          const y = HEIGHT - barH;

          const isCurrent = i === currentHour;
          const isCheap = i >= cheapestWindowStart && i < cheapestWindowEnd;
          const isPast = i < currentHour;

          let fill = "hsl(var(--muted))";
          if (isCheap) fill = "hsl(var(--chart-2))";
          if (isCurrent) fill = "hsl(var(--primary))";
          if (isPast && !isCheap) fill = "hsl(var(--muted-foreground) / 0.3)";

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={2}
                fill={fill}
                opacity={isPast && !isCurrent ? 0.5 : 1}
              />
              {/* Hour labels every 6h */}
              {i % 6 === 0 && (
                <text
                  x={x + barW / 2}
                  y={HEIGHT + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fill="hsl(var(--muted-foreground))"
                >
                  {String(i).padStart(2, "0")}:00
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-[hsl(var(--chart-2))]" />
          Cheapest window
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-[hsl(var(--primary))]" />
          Now
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-[hsl(var(--muted))]" />
          Upcoming
        </span>
      </div>
    </div>
  );
}
