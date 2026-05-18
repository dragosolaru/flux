import { redirect } from "next/navigation";
import { FlaskConical, Wifi } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { BRAND_MODELS } from "@/lib/brands/models";
import { getBrand } from "@/lib/brands/registry";
import type { BrandKey } from "@/lib/brands/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "About your data · Flux" };

const CATEGORIES = [
  { key: "telemetry",        label: "Vehicle telemetry",       liveDesc: "Real-time from OEM API",         mockDesc: "Tier-3 scenario simulator" },
  { key: "commands",         label: "Remote commands",         liveDesc: "Sent to vehicle via OEM API",     mockDesc: "Applied to simulator state" },
  { key: "charging-history", label: "Charging history",        liveDesc: "From OEM API + session records",  mockDesc: "Generated on motion transitions" },
  { key: "trips",            label: "Trip history",            liveDesc: "From OEM API + GPS logs",         mockDesc: "Generated on driving transitions" },
  { key: "tariff",           label: "Energy tariff prices",    liveDesc: "Live from provider API",          mockDesc: "Deterministic mock curves" },
  { key: "charging-network", label: "Charging network map",    liveDesc: "Live availability APIs",          mockDesc: "Static mock station registry" },
  { key: "weather",          label: "Weather & range derating",liveDesc: "Live from weather API",           mockDesc: "Mock weather provider" },
  { key: "routing",          label: "Trip routing",            liveDesc: "Live routing API",                mockDesc: "Great-circle heuristic" },
] as const;

function StatusBadge({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        live
          ? "bg-chart-2/15 text-chart-2"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      )}
    >
      {live ? <Wifi className="size-3" /> : <FlaskConical className="size-3" />}
      {live ? "Live" : "Mock"}
    </span>
  );
}

export default async function AboutDataPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, display_name, brand, model, data_source, nickname")
    .eq("user_id", session.user.id)
    .eq("is_active", true);

  const activeVehicles = vehicles ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">About your data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Transparency breakdown — what&apos;s live vs simulated across your fleet and platform services.
        </p>
      </div>

      {/* Per-vehicle status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your vehicles</CardTitle>
        </CardHeader>
        <CardContent>
          {activeVehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicles added yet.</p>
          ) : (
            <div className="divide-y">
              {activeVehicles.map((v) => {
                const isLive = v.data_source === "live";
                const brand = getBrand(v.brand as BrandKey);
                const spec = BRAND_MODELS[v.brand as BrandKey]?.find(
                  (m) => m.modelName === v.model,
                );

                return (
                  <div key={v.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-6">
                    <div className="sm:w-48">
                      <div className="font-medium">{v.nickname ?? v.display_name}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {v.brand}{v.model ? ` · ${v.model}` : ""}
                      </div>
                      <div className="mt-1">
                        <StatusBadge live={isLive} />
                      </div>
                    </div>
                    <div className="grid flex-1 grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      {CATEGORIES.slice(0, 4).map((cat) => (
                        <div key={cat.key} className="space-y-0.5">
                          <div className="font-medium text-muted-foreground">{cat.label}</div>
                          <StatusBadge live={isLive} />
                          <div className="text-muted-foreground/70">
                            {isLive ? cat.liveDesc : cat.mockDesc}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform services */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Platform services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {CATEGORIES.slice(4).map((cat) => (
              <div key={cat.key} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{cat.label}</span>
                  <StatusBadge live={false} />
                </div>
                <p className="text-xs text-muted-foreground">{cat.mockDesc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Connect a real vehicle via Settings to switch from mock to live data for that vehicle.
        Platform services (tariff, charging network, weather, routing) use mock providers in this demo.
      </p>
    </div>
  );
}
