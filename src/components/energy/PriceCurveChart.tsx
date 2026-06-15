"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useTranslations } from "next-intl";
import type { HourlyPrice } from "@/lib/external/tariffs/types";

interface PriceCurveChartProps {
  prices: HourlyPrice[];
  currentHour: number;
  cheapestWindowStart: number;
  cheapestWindowEnd: number;
}

interface TooltipPayload {
  value: number;
  payload: { hour: number; price: number };
}

function GlassTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  if (!entry) return null;
  return (
    <div className="rounded-xl border border-white/8 bg-background/80 px-3 py-2 text-xs backdrop-blur-sm">
      <p className="font-medium">
        {String(entry.payload.hour).padStart(2, "0")}:00
      </p>
      <p className="text-muted-foreground">
        {(entry.value * 100).toFixed(1)} ct/kWh
      </p>
    </div>
  );
}

export function PriceCurveChart({
  prices,
  currentHour,
  cheapestWindowStart,
  cheapestWindowEnd,
}: PriceCurveChartProps) {
  const t = useTranslations("energy");
  if (prices.length < 2) return null;

  const data = prices.map((p) => ({
    hour: p.hour,
    price: p.priceEurKwh,
  }));

  const minPrice = Math.min(...prices.map((p) => p.priceEurKwh));
  const maxPrice = Math.max(...prices.map((p) => p.priceEurKwh));
  const yDomain = [Math.max(0, minPrice * 0.85), maxPrice * 1.1] as [
    number,
    number,
  ];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.4}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="hour"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) =>
              v % 6 === 0 ? String(v).padStart(2, "0") + ":00" : ""
            }
            interval={0}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (v * 100).toFixed(0)}
            label={{ value: "ct/kWh", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10, fill: "currentColor", opacity: 0.5 } }}
          />
          <Tooltip content={<GlassTooltip />} />

          {/* Cheapest window background highlight */}
          {Array.from(
            { length: Math.max(0, cheapestWindowEnd - cheapestWindowStart) },
            (_, i) => cheapestWindowStart + i,
          ).map((h) => (
            <ReferenceLine
              key={h}
              x={h}
              stroke="hsl(var(--chart-2))"
              strokeOpacity={0.12}
              strokeWidth={18}
            />
          ))}

          {/* Current hour vertical dashed line */}
          <ReferenceLine
            x={currentHour}
            stroke="hsl(var(--primary))"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />

          <Area
            type="monotone"
            dataKey="price"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#priceGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-[hsl(var(--chart-2))]" />
          {t("cheapest_window_label")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-[hsl(var(--primary))]" />
          {t("now")}
        </span>
      </div>
    </div>
  );
}
