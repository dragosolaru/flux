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
  Upload,
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

interface DebugLog {
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  context: Record<string, unknown> | null;
  created_at: string;
}

interface MigrationRow {
  id: string;
  description: string;
  status: "applied" | "unknown";
  appliedAt: string | null;
}

interface MigrationsPayload {
  bootstrapped: boolean;
  migrations: MigrationRow[];
}

interface DebugPayload {
  generatedAt: string;
  logs: DebugLog[];
  chargers: ChargerStats | null;
  sources: { source: string; rows: number }[];
  recentRuns: IngestRun[];
  config: Record<string, boolean | string>;
  warnings: string[];
}

interface ProbeRow {
  source: string;
  count: number;
  ms: number;
  withOperator: number;
  withCountry: number;
  withPower: number;
  sample: { name: string | null; operator: string | null; country: string | null } | null;
  error?: string;
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

  const migrations = useQuery<MigrationsPayload>({
    queryKey: ["debug-migrations"],
    queryFn: () => apiFetch<MigrationsPayload>("/api/internal/debug/migrations"),
    staleTime: 10_000,
  });

  async function applyMigration(id: string) {
    setRunning(id);
    setLastError(null);
    try {
      await apiFetch("/api/internal/debug/migrations", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      toast.success(`${id} applied`);
      void migrations.refetch();
      void refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastError(`${id} failed: ${message}`);
      toast.error(`${id} failed`);
    } finally {
      setRunning(null);
    }
  }

  const [probe, setProbe] = useState<ProbeRow[] | null>(null);
  const [ocrResult, setOcrResult] = useState<unknown>(null);
  const [ocrVariant, setOcrVariant] = useState<"energy" | "car">("energy");

  async function clearCache(region?: (typeof CORRIDOR)[number]) {
    const label = region ? `cache:${region.label}` : "cache:all";
    setRunning(label);
    setLastError(null);
    try {
      const res = await apiFetch<{ cleared: number; backend: string }>(
        "/api/internal/debug/cache",
        {
          method: "POST",
          body: JSON.stringify(
            region
              ? {
                  minLat: region.minLat,
                  minLng: region.minLng,
                  maxLat: region.maxLat,
                  maxLng: region.maxLng,
                }
              : {},
          ),
        },
      );
      toast.success(`Cleared ${res.cleared} key(s) from ${res.backend}`);
    } catch (err) {
      setLastError(`Clear cache failed: ${err instanceof Error ? err.message : String(err)}`);
      toast.error("Clear cache failed");
    } finally {
      setRunning(null);
    }
  }

  async function testOcr(file: File) {
    setRunning("ocr");
    setLastError(null);
    setOcrResult(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        // readAsDataURL gives "data:<mime>;base64,<payload>" — the API wants
        // the payload alone.
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

      const res = await apiFetch<unknown>("/api/internal/debug/ocr", {
        method: "POST",
        body: JSON.stringify({ base64, mimeType: file.type, variant: ocrVariant }),
      });
      setOcrResult(res);
      toast.success("Extraction finished");
    } catch (err) {
      setLastError(`OCR failed: ${err instanceof Error ? err.message : String(err)}`);
      toast.error("OCR failed");
    } finally {
      setRunning(null);
    }
  }

  async function applyAllMigrations() {
    const list = migrations.data?.migrations ?? [];
    setRunning("all-migrations");
    setLastError(null);
    const failures: string[] = [];
    for (const m of list) {
      try {
        await apiFetch("/api/internal/debug/migrations", {
          method: "POST",
          body: JSON.stringify({ id: m.id }),
        });
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    setRunning(null);
    void migrations.refetch();
    void refetch();
    if (failures.length === 0) {
      toast.success(`${list.length} migrations applied`);
    } else {
      setLastError(failures.join("\n"));
      toast.error(`${failures.length} of ${list.length} failed`);
    }
  }

  async function runProbe(region: (typeof CORRIDOR)[number]) {
    setRunning(`probe:${region.label}`);
    setLastError(null);
    setProbe(null);
    try {
      // Probe a small window at the region's centre — this measures each
      // source, it does not import.
      const midLat = (region.minLat + region.maxLat) / 2;
      const midLng = (region.minLng + region.maxLng) / 2;
      const res = await apiFetch<{ results: ProbeRow[] }>("/api/internal/debug/probe", {
        method: "POST",
        body: JSON.stringify({
          minLat: midLat - 0.25,
          minLng: midLng - 0.25,
          maxLat: midLat + 0.25,
          maxLng: midLng + 0.25,
        }),
      });
      setProbe(res.results);
    } catch (err) {
      setLastError(`Probe failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(null);
    }
  }

  async function runDedupe() {
    setRunning("dedupe");
    setLastError(null);
    setLastResult(null);
    try {
      const res = await apiFetch<IngestResult>("/api/internal/debug/dedupe", { method: "POST" });
      setLastResult(res);
      toast.success("Dedupe finished");
      void refetch();
    } catch (err) {
      setLastError(`Dedupe failed: ${err instanceof Error ? err.message : String(err)}`);
      toast.error("Dedupe failed");
    } finally {
      setRunning(null);
    }
  }

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
      {
        diagnostics: data ?? null,
        migrations: migrations.data ?? null,
        probe,
        ocrResult,
        lastResult,
        lastError,
      },
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

      <section className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Migrations</h2>
          <button
            onClick={() => void applyAllMigrations()}
            disabled={running !== null}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            {running === "all-migrations" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Apply all
          </button>
        </div>
        {migrations.data && !migrations.data.bootstrapped && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Runner not installed. Paste <code>supabase/migrations/037_...sql</code> into the
            Supabase SQL editor once; every migration below then applies from here.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          &quot;Unknown&quot; means this panel has no record of applying it — a migration you ran by
          hand in the SQL editor also shows as unknown. Re-applying is safe: all of them are
          idempotent.
        </p>
        <div className="space-y-2">
          {(migrations.data?.migrations ?? []).map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/60 p-3"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs">{m.id}</p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    m.status === "applied"
                      ? "bg-green-500/15 text-green-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m.status}
                </span>
                <button
                  onClick={() => void applyMigration(m.id)}
                  disabled={running !== null}
                  className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 text-sm hover:bg-muted disabled:opacity-50"
                >
                  {running === m.id ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Apply
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Probe sources</h2>
        <p className="text-xs text-muted-foreground">
          Queries each source separately for a small window and reports what it returned —
          nothing is written. The combined ingest cannot tell a dead connector apart from an
          area with no chargers.
        </p>
        <div className="flex flex-wrap gap-2">
          {CORRIDOR.map((r) => (
            <IngestButton
              key={r.label}
              label={`Probe ${r.label}`}
              busy={running === `probe:${r.label}`}
              disabled={running !== null}
              onClick={() => void runProbe(r)}
            />
          ))}
        </div>
        {probe && (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Source</th>
                  <th className="py-1.5 pr-3">Rows</th>
                  <th className="py-1.5 pr-3">ms</th>
                  <th className="py-1.5 pr-3">w/ operator</th>
                  <th className="py-1.5 pr-3">w/ country</th>
                  <th className="py-1.5 pr-3">w/ power</th>
                  <th className="py-1.5">Sample</th>
                </tr>
              </thead>
              <tbody>
                {probe.map((r) => (
                  <tr key={r.source} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-mono">{r.source}</td>
                    <td className={`py-1.5 pr-3 tabular-nums ${r.count === 0 ? "text-amber-400" : ""}`}>
                      {r.count}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{r.ms}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.withOperator}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.withCountry}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.withPower}</td>
                    <td className="py-1.5 text-muted-foreground">
                      {r.error
                        ? `error: ${r.error}`
                        : r.sample
                          ? [r.sample.name, r.sample.operator, r.sample.country]
                              .filter(Boolean)
                              .join(" · ") || "—"
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Collapse duplicates</h2>
        <p className="text-xs text-muted-foreground">
          Repeats the batched dedupe until nothing is left to merge. Needs migration 034. New
          duplicates are prevented at ingest, so this is for rows stored before that fix.
        </p>
        <IngestButton
          label="Run dedupe"
          busy={running === "dedupe"}
          disabled={running !== null}
          onClick={() => void runDedupe()}
        />
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Freshness cache</h2>
        <p className="text-xs text-muted-foreground">
          Forgets that an area was already imported, so the next read re-ingests it instead of
          waiting out the TTL (7 days per tile, 48 hours per country). Deletes no stations.
        </p>
        <div className="flex flex-wrap gap-2">
          {CORRIDOR.map((r) => (
            <IngestButton
              key={r.label}
              label={`Clear ${r.label}`}
              busy={running === `cache:${r.label}`}
              disabled={running !== null}
              onClick={() => void clearCache(r)}
            />
          ))}
          <IngestButton
            label="Clear everything"
            busy={running === "cache:all"}
            disabled={running !== null}
            onClick={() => void clearCache()}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Test OCR</h2>
        <p className="text-xs text-muted-foreground">
          Runs a photo or PDF through the extraction prompt and shows what Claude returned.
          Nothing is saved — no document, no upload, no cost record. Each run costs tokens.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {(["energy", "car"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setOcrVariant(v)}
              className={`min-h-11 rounded-lg border px-3 text-sm ${
                ocrVariant === v
                  ? "border-primary/50 bg-primary/15 font-semibold"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {v === "energy" ? "Energy receipt" : "Car document"}
            </button>
          ))}
        </div>

        <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 text-sm hover:bg-muted">
          {running === "ocr" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Extracting…
            </>
          ) : (
            <>
              <Upload className="size-4" />
              Choose a photo or PDF
            </>
          )}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={running !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so picking the same file twice fires onChange again.
              e.target.value = "";
              if (file) void testOcr(file);
            }}
          />
        </label>

        {ocrResult != null && (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs">
            {JSON.stringify(ocrResult, null, 2)}
          </pre>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Server logs</h2>
        <p className="text-xs text-muted-foreground">
          Warnings and errors recorded by the ingest pipeline, newest first. Needs migration
          037.
        </p>
        {data.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded.</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {data.logs.map((l, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      l.level === "error"
                        ? "font-semibold text-destructive"
                        : l.level === "warn"
                          ? "font-semibold text-amber-400"
                          : "text-muted-foreground"
                    }
                  >
                    {l.level}
                  </span>
                  <span className="font-mono text-muted-foreground">{l.scope}</span>
                  <span className="ml-auto text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 break-words">{l.message}</p>
                {l.context && (
                  <pre className="mt-1 overflow-x-auto text-[11px] text-muted-foreground">
                    {JSON.stringify(l.context)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
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
