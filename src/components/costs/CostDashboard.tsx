"use client";

import { Car, Fuel, Home, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostAggregation, MonthlyBucket } from "@/types/costs";

interface CostsResponse extends CostAggregation {
  petrolEquivalentCostRon: number;
  totalKm: number;
}

interface CostDashboardProps {
  data: CostsResponse | undefined;
  isLoading: boolean;
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtRon(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toFixed(2)} lei`;
}

function MonthlyCostChart({ months }: { months: MonthlyBucket[] }) {
  if (months.length === 0) return null;
  const maxCost = Math.max(...months.map((m) => m.costRon), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="size-4" />
          Trend lunar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-28 items-end gap-1.5 pb-5">
          {months.slice(-12).map((m) => {
            const MONTH_NAMES = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
            const monthIdx = parseInt(m.month.slice(5)) - 1;
            const label = MONTH_NAMES[monthIdx] ?? m.month.slice(5);
            return (
              <div key={m.month} className="group relative flex flex-1 flex-col items-end justify-end" style={{ height: "100%" }}>
                <div
                  className="w-full rounded-t bg-primary/70 transition-all group-hover:bg-primary"
                  style={{ height: `${(m.costRon / maxCost) * 96}%`, minHeight: m.costRon > 0 ? 3 : 0 }}
                />
                <span className="absolute -bottom-5 left-0 right-0 text-center text-[9px] text-muted-foreground">
                  {label}
                </span>
                <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-[10px] shadow group-hover:block">
                  {m.costRon.toFixed(0)} lei · {m.kwh.toFixed(1)} kWh
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function CostDashboard({ data, isLoading }: CostDashboardProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const hasData = data.totalCostRon > 0;
  const splitHomePct = data.totalKwh > 0
    ? Math.round((data.homeKwh / data.totalKwh) * 100)
    : null;
  const savingsRon = data.petrolEquivalentCostRon - data.totalCostRon;

  return (
    <div className="space-y-3">
      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Cost per km */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Car className="size-4" />
              Cost per km
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {hasData ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Home className="size-3" /> Acasă
                  </span>
                  <span className="font-medium">{fmt(data.costPerKmHome, 3)} lei/km</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Zap className="size-3" /> Public
                  </span>
                  <span className="font-medium">{fmt(data.costPerKmPublic, 3)} lei/km</span>
                </div>
                {data.costPerKmBlended != null && (
                  <div className="flex justify-between border-t pt-1 text-sm">
                    <span className="text-muted-foreground">Medie</span>
                    <span className="font-semibold">{fmt(data.costPerKmBlended, 3)} lei/km</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Adaugă documente pentru a vedea costul/km</p>
            )}
          </CardContent>
        </Card>

        {/* Split acasă / public */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Home className="size-4" />
              Acasă vs Public
            </CardTitle>
          </CardHeader>
          <CardContent>
            {splitHomePct != null ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{splitHomePct}% acasă</span>
                  <span>{100 - splitHomePct}% public</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${splitHomePct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{fmtRon(data.homeCostRon)}</span>
                  <span>{fmtRon(data.publicCostRon)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Fără date încă</p>
            )}
          </CardContent>
        </Card>

        {/* Total cheltuieli */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="size-4" />
              Total energie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold">{fmtRon(data.totalCostRon)}</p>
            <p className="text-xs text-muted-foreground">{fmt(data.totalKwh, 1)} kWh total</p>
            {data.totalKm > 0 && (
              <p className="text-xs text-muted-foreground">{Math.round(data.totalKm)} km parcurși</p>
            )}
          </CardContent>
        </Card>

        {/* Comparație benzină */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Fuel className="size-4" />
              vs Benzină
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {hasData && data.totalKm > 0 && data.petrolEquivalentCostRon > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Benzină echivalent (7L/100km)
                </p>
                <p className="text-lg font-bold text-muted-foreground line-through">
                  {fmtRon(data.petrolEquivalentCostRon)}
                </p>
                {savingsRon > 0 ? (
                  <p className="text-sm font-semibold text-chart-2">
                    Economisești {fmtRon(savingsRon)}
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-destructive">
                    Cu {fmtRon(-savingsRon)} mai scump
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {hasData ? "Înregistrează km parcurși pentru comparație" : "Adaugă documente pentru comparație"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly trend */}
      {data.monthlyTrend.length > 0 && (
        <MonthlyCostChart months={data.monthlyTrend} />
      )}
    </div>
  );
}
