"use client";

import { useQuery } from "@tanstack/react-query";
import { Moon, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-fetch";
import { setSleepMode, useSleepMode } from "@/lib/vehicle-sleep";

interface TeslaCallCounts {
  available: boolean;
  read: number;
  wake: number;
  command: number;
  hourly: { hour: string; read: number; wake: number; command: number }[];
}

/**
 * "Is the app keeping my car awake?" — the switch, and the evidence.
 *
 * The evidence half matters more than the switch. Every other reassurance in
 * this codebase is an assertion about code: an interval that is off, a screen
 * that passes `poll: false`. Those can all be true and the car can still be
 * kept awake by one call site nobody checked — which is exactly what happened.
 * The counters below are taken at the last point before a request leaves for
 * Tesla, so they count what happened rather than what was meant.
 *
 * `wake` is the number to read. Waking is the only call that pulls a sleeping
 * car out of sleep, and since it is now reachable from exactly one endpoint
 * behind a driver's tap, any wake nobody asked for is a bug with a timestamp.
 */
export function SleepPanel() {
  const sleeping = useSleepMode();
  const [refreshing, setRefreshing] = useState(false);

  const calls = useQuery<TeslaCallCounts>({
    queryKey: ["debug", "tesla-calls"],
    queryFn: () => apiFetch<TeslaCallCounts>("/api/internal/debug/tesla-calls"),
    staleTime: 30_000,
  });

  const data = calls.data;
  const peak = data ? Math.max(1, ...data.hourly.map((h) => h.read + h.wake + h.command)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/60 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {sleeping ? "Nu contactăm mașina" : "Contactăm mașina normal"}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {sleeping
              ? "Niciun ecran nu mai cere starea. Datele afișate sunt ultima citire cunoscută."
              : "Ecranele citesc starea când le deschizi. O mașină adormită NU este trezită."}
          </p>
        </div>
        <button
          onClick={() => {
            setSleepMode(!sleeping);
            toast.success(sleeping ? "Actualizările sunt pornite" : "Mașina e lăsată în pace");
          }}
          className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${
            sleeping
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-muted/40 hover:bg-muted"
          }`}
        >
          <Moon className="size-4" />
          {sleeping ? "Pornește actualizările" : "Oprește tot"}
        </button>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">Ce a ajuns la mașină · ultimele 24h</p>
          <button
            onClick={() => {
              setRefreshing(true);
              void calls.refetch().finally(() => setRefreshing(false));
            }}
            className="flex min-h-11 items-center gap-1.5 px-2 text-[11px] text-muted-foreground"
          >
            <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
            Reîmprospătează
          </button>
        </div>

        {data && !data.available ? (
          // Zeros would read as "nothing happened", which is a different claim
          // from "we are not counting".
          <p className="text-[11px] text-amber-300">
            Fără Redis nu se poate număra. Setează UPSTASH_REDIS_REST_URL / _TOKEN
            (sau KV_REST_API_URL / _TOKEN) ca panoul să arate cifre reale.
          </p>
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Citiri" value={data.read} tone="muted" />
              <Metric
                label="Treziri"
                value={data.wake}
                tone={data.wake > 0 ? "warn" : "ok"}
              />
              <Metric label="Comenzi" value={data.command} tone="muted" />
            </div>

            <div className="flex h-12 items-end gap-px pt-1">
              {data.hourly.map((h) => {
                const total = h.read + h.wake + h.command;
                return (
                  <div
                    key={h.hour}
                    title={`${h.hour}:00 — ${h.read} citiri, ${h.wake} treziri, ${h.command} comenzi`}
                    className="flex-1"
                    style={{
                      height: `${Math.max(2, (total / peak) * 100)}%`,
                      background: h.wake > 0 ? "var(--chart-3)" : "var(--muted-foreground)",
                      opacity: total === 0 ? 0.25 : 1,
                    }}
                  />
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              O oră cu treziri e marcată chihlimbar. Trezirea e singura care scoate
              mașina din somn — dacă apare una pe care n-ai cerut-o, e un bug, nu
              o setare.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Se încarcă…</p>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "muted";
}) {
  return (
    <div className="rounded border border-border/60 bg-muted/20 p-2">
      <p
        className={`text-lg font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-green-300" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
