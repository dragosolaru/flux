"use client";

// Developer diagnostics panel. Deliberately English-only: this is a build-time
// tool for the maintainer, not a product surface, so it stays out of the five
// locale files rather than adding ~40 keys that no user will ever read.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-fetch";

interface ChargerStats {
  total: number;
  no_country: number;
  operators: number;
  no_operator: number;
}

interface IngestRun {
  source: string | null;
  status: string | null;
  fetched: number | null;
  upserted: number | null;
  error: string | null;
  finished_at: string | null;
}

interface DebugPayload {
  generatedAt: string;
  chargers: ChargerStats | null;
  sources: { source: string; rows: number }[];
  recentRuns: IngestRun[];
  config: Record<string, boolean | string>;
  warnings: string[];
}

interface IngestResult {
  mode: string;
  elapsedMs: number;
  logs: string[];
  [key: string]: unknown;
}

const CORRIDOR = [
  { label: "Cluj", minLat: 46.5, minLng: 23.2, maxLat: 47.2, maxLng: 24.2 },
  { label: "Bucharest", minLat: 44.2, minLng: 25.8, maxLat: 44.7, maxLng: 26.4 },
  { label: "Bulgaria transit", minLat: 41.5, minLng: 23.0, maxLat: 43.5, maxLng: 26.0 },
  { label: "N. Greece / Kavala", minLat: 40.5, minLng: 23.5, maxLat: 41.5, maxLng: 25.5 },
];

export function DebugClient() {
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<DebugPayload>({
    queryKey: ["debug-diagnostics"],
    queryFn: () => apiFetch<DebugPayload>("/api/internal/debug"),
    staleTime: 10_000,
  });

  async function runIngest(label: string, body: Record<string, unknown>) {
    setRunning(label);
    setLastError(null);
    setLastResult(null);
    try {
      const res = await apiFetch<IngestResult>("/api/internal/debug/ingest", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLastResult(res);
      toast.success(`${label} finished in ${Math.round(res.elapsedMs / 1000)}s`);
      void refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastError(`${label} failed: ${message}`);
      toast.error(`${label} failed`);
    } finally {
      setRunning(null);
    }
  }

  function copyAll() {
    const blob = JSON.stringify(
      { diagnostics: data ?? null, lastResult, lastError },
      null,
      2,
    );
    navigator.clipboard
      .writeText(blob)
      .then(() => toast.success("Diagnostics copied — paste them into the chat"))
      .catch(() => toast.error("Could not copy"));
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading diagnostics…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="m-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <p className="font-semibold text-destructive">Diagnostics unavailable</p>
        <p className="mt-1 text-muted-foreground">
          This panel needs your e-mail listed in the <code>ADMIN_EMAILS</code> environment
          variable on Vercel, then a redeploy.
        </p>
      </div>
    );
  }

  const c = data.chargers;

  return (
    <div className="space-y-5 p-4 pb-24 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Database className="size-5 text-primary" />
          Debug
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={copyAll}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Copy className="size-4" />
            Copy all
          </button>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-400">
            <AlertTriangle className="size-4" />
            {data.warnings.length} warning{data.warnings.length > 1 ? "s" : ""}
          </p>
          <ul className="space-y-1.5">
            {data.warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-200/90">
                • {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Charger database</h2>
        {c ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={c.total.toLocaleString()} />
            <Stat label="No country" value={c.no_country.toLocaleString()} bad={c.no_country > 0} />
            <Stat label="Operators" value={c.operators.toLocaleString()} bad={c.operators === 0} />
            <Stat
              label="No operator"
              value={c.no_operator.toLocaleString()}
              bad={c.total > 0 && c.no_operator === c.total}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Stats unavailable — migration 035 may not be applied yet.
          </p>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rows per source
          </p>
          {data.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sources have contributed.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.sources.map((s) => (
                <span key={s.source} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  {s.source}: <span className="font-semibold">{s.rows.toLocaleString()}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Populate now</h2>
        <p className="text-xs text-muted-foreground">
          Country mode fetches OCM plus the national registries. Region mode fetches every
          source, including OpenStreetMap and TomTom.
        </p>

        <div className="flex flex-wrap gap-2">
          <IngestButton
            label="Countries: RO, BG, GR"
            busy={running === "RO/BG/GR"}
            disabled={running !== null}
            onClick={() => void runIngest("RO/BG/GR", { mode: "country", countries: ["ro", "bg", "gr"] })}
          />
          <IngestButton
            label="Countries: RS, MK, HU"
            busy={running === "RS/MK/HU"}
            disabled={running !== null}
            onClick={() => void runIngest("RS/MK/HU", { mode: "country", countries: ["rs", "mk", "hu"] })}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CORRIDOR.map((r) => (
            <IngestButton
              key={r.label}
              label={`All sources: ${r.label}`}
              busy={running === r.label}
              disabled={running !== null}
              onClick={() =>
                void runIngest(r.label, {
                  mode: "region",
                  minLat: r.minLat,
                  minLng: r.minLng,
                  maxLat: r.maxLat,
                  maxLng: r.maxLng,
                })
              }
            />
          ))}
        </div>

        {running && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Running {running}… this can take a few minutes. Leave the page open.
          </p>
        )}

        {lastError && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {lastError}
          </pre>
        )}

        {lastResult && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Configuration</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.config).map(([k, v]) => (
            <span
              key={k}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                v === true || (typeof v === "string" && v.length > 0)
                  ? "bg-green-500/15 text-green-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {v === true || (typeof v === "string" && v.length > 0) ? (
                <CheckCircle2 className="size-3" />
              ) : (
                <XCircle className="size-3" />
              )}
              {k}
              {typeof v === "string" && v.length > 0 && `: ${v}`}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Presence only — no key values are ever sent to the browser.
        </p>
      </section>

      <section className="space-y-2 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Recent ingest runs</h2>
        {data.recentRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs recorded.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">When</th>
                  <th className="py-1.5 pr-3">Source</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3">Fetched</th>
                  <th className="py-1.5 pr-3">Upserted</th>
                  <th className="py-1.5">Error</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                      {r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-1.5 pr-3">{r.source ?? "—"}</td>
                    <td className={`py-1.5 pr-3 ${r.status === "error" ? "text-destructive" : "text-green-400"}`}>
                      {r.status ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.fetched ?? "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.upserted ?? "—"}</td>
                    <td className="py-1.5 text-destructive">{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Generated {new Date(data.generatedAt).toLocaleString()}. Server-side logs (source
        failures such as <code>[ocm]</code>, <code>[tomtom]</code>, <code>[bnetza]</code>) appear
        in the Vercel dashboard under Logs.
      </p>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className={`text-lg font-semibold tabular-nums ${bad ? "text-amber-400" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function IngestButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 text-sm hover:bg-muted disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      {label}
    </button>
  );
}
