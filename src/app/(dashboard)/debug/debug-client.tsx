"use client";

// Developer diagnostics panel. Deliberately English-only: this is a build-time
// tool for the maintainer, not a product surface, so it stays out of the five
// locale files rather than adding ~40 keys that no user will ever read.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ChevronRight,
  Circle,
  CircleDashed,
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
  tesla?: {
    steps: { step: string; ok: boolean; blocks: string }[];
    nextStep: string | null;
    grants?: {
      vehicle: string;
      granted: string[];
      missing: string[];
      updatedAt: string | null;
    }[];
    virtualKeyUrl?: string | null;
  };
  roadmap?: {
    goal: string;
    milestones: { goal: string; nextStep: string; state: "done" | "todo" | "manual" }[];
  };
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

// Every bulk country, so a region can be topped up without editing code.
// Order puts the RO/Balkan corridor first because that is the one being worked.
const COUNTRIES: { code: string; name: string }[] = [
  { code: "ro", name: "Romania" },
  { code: "bg", name: "Bulgaria" },
  { code: "gr", name: "Greece" },
  { code: "rs", name: "Serbia" },
  { code: "mk", name: "North Macedonia" },
  { code: "hu", name: "Hungary" },
  { code: "at", name: "Austria" },
  { code: "hr", name: "Croatia" },
  { code: "si", name: "Slovenia" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "nl", name: "Netherlands" },
];

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
  const [rawProbe, setRawProbe] = useState<unknown>(null);
  // Panels are closed by default so the page opens as a status screen rather
  // than a wall of controls — it is read on a phone far more often than acted on.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [apiPath, setApiPath] = useState("/api/chargers/stats");
  const [apiResult, setApiResult] = useState<unknown>(null);
  // Several routes worth poking at are POST-only; GET on them returns 405.
  const [apiMethod, setApiMethod] = useState<"GET" | "POST">("GET");
  const [partnerResult, setPartnerResult] = useState<unknown>(null);
  const [ocrResult, setOcrResult] = useState<unknown>(null);
  // Held in memory for exactly as long as this page stays open, and never put
  // anywhere else — see the deliberate omission from copyAll below.
  const [keypair, setKeypair] = useState<{
    privateKeyPem: string;
    privateKeyBase64: string;
    publicKeyPem: string;
  } | null>(null);
  // Populated only when the clipboard write is refused, so the text can still
  // be selected by hand — some mobile browsers block the API outright.
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [ocrVariant, setOcrVariant] = useState<"energy" | "car">("energy");
  const [pickedCountries, setPickedCountries] = useState<string[]>(["ro"]);

  // Same failure logged forty times is one problem, not forty. The panel now
  // pulls 200 rows so nothing old gets pushed off the end, which only works if
  // the repeats collapse — otherwise a single retrying source buries the rest.
  // Rows arrive newest-first, so the first of a group is the latest.
  const groupedLogs = useMemo(() => {
    const byKey = new Map<
      string,
      {
        key: string;
        level: DebugLog["level"];
        scope: string;
        message: string;
        context: Record<string, unknown> | null;
        count: number;
        latest: string;
        earliest: string;
      }
    >();
    for (const l of data?.logs ?? []) {
      const key = `${l.level}|${l.scope}|${l.message}`;
      const hit = byKey.get(key);
      if (hit) {
        hit.count += 1;
        hit.earliest = l.created_at;
      } else {
        byKey.set(key, {
          key,
          level: l.level,
          scope: l.scope,
          message: l.message,
          context: l.context,
          count: 1,
          latest: l.created_at,
          earliest: l.created_at,
        });
      }
    }
    // Split by area. "I only have charger errors" was the complaint, and it was
    // accurate: a flat list is dominated by whichever subsystem is noisiest,
    // which is never the one being debugged. Tesla comes first and is shown
    // even when empty — "nothing logged" is itself the answer when you are
    // waiting for a command failure to appear.
    const all = [...byKey.values()];
    const isTesla = (scope: string) =>
      scope.startsWith("tesla/") || scope.startsWith("vehicles/");
    return {
      tesla: all.filter((l) => isTesla(l.scope)),
      other: all.filter((l) => !isTesla(l.scope)),
      total: data?.logs?.length ?? 0,
    };
  }, [data?.logs]);

  // Anything older than this is history, not a live problem. Every entry on
  // screen was a day or two old while being read as current.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const generatedAtMs = data?.generatedAt ? Date.parse(data.generatedAt) : 0;
  const teslaFresh = groupedLogs.tesla.filter(
    (l) => generatedAtMs - new Date(l.latest).getTime() < DAY_MS,
  ).length;
  // The car answered and said our key is not one of its keys. Distinct from
  // never having paired: re-pairing is the obvious response and the wrong one,
  // because it re-pairs whatever key Tesla currently holds for the domain.
  const refusedForKeyNotPaired = groupedLogs.tesla.some(
    (l) =>
      l.scope === "vehicles/commands" &&
      typeof l.context?.matched === "string" &&
      l.context.matched === "key-not-paired",
  );

  function toggleCountry(code: string) {
    setPickedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

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

  // Shows the upstream response verbatim. `probe` above reports that a source
  // returned nothing; this reports why — the parse error names a format but not
  // the columns, and a 400 names no parameter at all.
  async function runSourceProbe(source: string) {
    setRunning(`raw:${source}`);
    setLastError(null);
    setRawProbe(null);
    try {
      setRawProbe(
        await apiFetch<unknown>("/api/internal/debug/source-probe", {
          method: "POST",
          body: JSON.stringify({ source }),
        }),
      );
    } catch (err) {
      setLastError(`Source probe failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(null);
    }
  }

  /**
   * Calls one of the app's own API routes and shows the response.
   *
   * Same-origin from the browser with the caller's own session, so this is a
   * request they could already make by typing the URL — no server route, and
   * none of the SSRF surface a server-side fetcher would have. Restricted to
   * GET under /api/ so it stays a diagnostic and cannot mutate anything.
   */
  async function callApi() {
    const path = apiPath.trim();
    if (!path.startsWith("/api/")) {
      setLastError("Path must start with /api/");
      return;
    }
    setRunning("api");
    setLastError(null);
    setApiResult(null);
    const startedAt = Date.now();
    try {
      const res = await fetch(path, {
        method: apiMethod,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        ...(apiMethod === "POST" ? { body: "{}" } : {}),
      });
      const text = await res.text();
      const contentType = res.headers.get("content-type") ?? "";
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        // NOT the useful answer, whatever the old comment here claimed. A wrong
        // /api/ path makes Next.js render the app's HTML 404 — around 200 KB of
        // markup, script tags and the entire locale bundle — and the panel
        // dumped all of it. The status is the finding; the page is noise that
        // buries it and makes the result unusable to paste anywhere.
        const excerpt = text
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200);
        body = {
          nonJson: true,
          contentType: contentType.split(";")[0] || "unknown",
          bytes: text.length,
          excerpt,
          ...(res.status === 404
            ? { hint: "No API route at this path — Next.js served the HTML 404 page." }
            : {}),
          ...(res.status === 405
            ? { hint: `Route exists but does not accept ${apiMethod}. Try the other method.` }
            : {}),
        };
      }
      setApiResult({ path, method: apiMethod, status: res.status, ms: Date.now() - startedAt, body });
    } catch (err) {
      setApiResult({ path, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(null);
    }
  }

  async function teslaPartner(action: "status" | "register") {
    setRunning(`partner:${action}`);
    setLastError(null);
    setPartnerResult(null);
    try {
      setPartnerResult(
        await apiFetch<unknown>("/api/internal/debug/tesla-partner", {
          method: "POST",
          body: JSON.stringify({ action, region: "eu" }),
        }),
      );
    } catch (err) {
      setLastError(`Partner ${action} failed: ${err instanceof Error ? err.message : String(err)}`);
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

  async function generateKeypair() {
    setRunning("keypair");
    setLastError(null);
    setKeypair(null);
    try {
      setKeypair(
        await apiFetch<{
          privateKeyPem: string;
          privateKeyBase64: string;
          publicKeyPem: string;
        }>("/api/internal/debug/tesla-keypair", { method: "POST" }),
      );
    } catch (err) {
      setLastError(
        `Keypair generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setRunning(null);
    }
  }

  function copyText(text: string, label: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error("Clipboard blocked — select the text instead"));
  }

  /**
   * A section as a handful of lines, not a payload.
   *
   * The full JSON runs to ~900 lines and buries its own findings — pasting it
   * costs the reader more than it tells them, and most of it is never relevant
   * to the question being asked. These say what state the area is in, and
   * nothing else. "Copy all (raw)" is still there for when the shape of the
   * data is itself the question.
   */
  function buildReport(section: "car" | "chargers" | "progress"): string {
    if (!data) return "no data";
    const when = new Date(data.generatedAt).toISOString().slice(0, 16).replace("T", " ");
    const out: string[] = [`FLUX · ${section.toUpperCase()} · ${when}Z`];

    const logLine = (l: (typeof groupedLogs.tesla)[number]) => {
      const ageH = Math.round((generatedAtMs - new Date(l.latest).getTime()) / 3_600_000);
      const age = ageH >= 24 ? `${Math.floor(ageH / 24)}d` : `${ageH}h`;
      const ctx = l.context ? ` ${JSON.stringify(l.context).slice(0, 120)}` : "";
      return `  ${l.scope} ×${l.count} ${age} — ${l.message}${ctx}`;
    };

    if (section === "car") {
      const t = data.tesla;
      if (t) {
        const unmet = t.steps.filter((x) => !x.ok);
        out.push(
          `setup ${t.steps.length - unmet.length}/${t.steps.length} ok` +
            (unmet.length ? ` · missing: ${unmet.map((x) => x.step).join(", ")}` : ""),
        );
        out.push(`next: ${t.nextStep ?? "—"}`);
        for (const g of t.grants ?? []) {
          out.push(
            `car "${g.vehicle}" · scopes ${g.granted.length}/9` +
              (g.missing.length ? ` · missing ${g.missing.join(",")}` : ""),
          );
        }
        if (!t.grants?.length) out.push("no linked car");
      }
      if (refusedForKeyNotPaired) {
        out.push(
          "!! car refused a SIGNED command: our key is not paired to it." +
            " Re-pairing alone will not fix this — check Tesla holds the same" +
            " key the proxy signs with (Check status → servedKeyMatches).",
        );
      }
      // Whatever the last Check status returned, if one was run. The key match
      // is the question every "not paired" failure turns into, and it is
      // otherwise buried in a raw JSON dump further down the page.
      const pr = partnerResult as
        | { servedKeyMatches?: boolean; keyMismatchHint?: string }
        | null;
      if (pr && typeof pr.servedKeyMatches === "boolean") {
        out.push(
          `partner key match: ${pr.servedKeyMatches}` +
            (pr.keyMismatchHint ? ` — ${pr.keyMismatchHint}` : ""),
        );
      } else {
        out.push("partner key match: not checked this session");
      }
      out.push(
        groupedLogs.tesla.length
          ? `logs (${groupedLogs.tesla.length} distinct):`
          : "logs: none — no command has failed server-side",
      );
      out.push(...groupedLogs.tesla.map(logLine));
    }

    if (section === "chargers") {
      const c = data.chargers;
      if (c) {
        out.push(
          `${c.total} chargers · ${c.operators} operators · ${c.no_operator} without one · ${c.no_country} without a country`,
        );
      }
      out.push(`sources: ${data.sources.map((x) => `${x.source} ${x.rows}`).join(" · ")}`);
      const failed = data.recentRuns.filter((r) => r.status === "error").length;
      out.push(`last ${data.recentRuns.length} runs · ${failed} failed`);
      out.push(`logs (${groupedLogs.other.length} distinct):`);
      out.push(...groupedLogs.other.map(logLine));
    }

    if (section === "progress") {
      for (const m of data.roadmap?.milestones ?? []) {
        const mark = m.state === "done" ? "[x]" : m.state === "manual" ? "[~]" : "[ ]";
        out.push(`${mark} ${m.goal}`);
        if (m.state !== "done") out.push(`    → ${m.nextStep}`);
      }
      const migs = migrations.data?.migrations ?? [];
      const pending = migs.filter((m) => m.status !== "applied");
      out.push(
        `migrations: ${migs.length - pending.length}/${migs.length} applied` +
          (pending.length ? ` · pending ${pending.map((m) => m.id).join(", ")}` : ""),
      );
      if (data.warnings.length) out.push(...data.warnings.map((w) => `! ${w}`));
    }

    return out.join("\n");
  }

  function copyReport(section: "car" | "chargers" | "progress") {
    const text = buildReport(section);
    setCopyFallback(null);
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(`${section} report copied`))
      .catch(() => {
        setCopyFallback(text);
        toast.error("Clipboard blocked — select the text below instead");
      });
    if (!navigator.clipboard) setCopyFallback(text);
  }

  function copyAll() {
    // The whole payload, ~900 lines. Demoted to a secondary button once each
    // section grew a report: this is for when the shape of the data is itself
    // the question, not for answering "what is wrong with the car".
    //
    // The keypair is deliberately absent. This blob exists to be pasted into a
    // chat or an issue, which is the last place a signing key should turn up,
    // and a diagnostics dump that quietly swept one along would be a trap.
    const blob = JSON.stringify(
      {
        diagnostics: data ?? null,
        migrations: migrations.data ?? null,
        probe,
        rawProbe,
        apiResult,
        partnerResult,
        ocrResult,
        lastResult,
        lastError,
      },
      null,
      2,
    );
    setCopyFallback(null);
    navigator.clipboard
      ?.writeText(blob)
      .then(() => toast.success("Copied — paste it into the chat"))
      .catch(() => {
        setCopyFallback(blob);
        toast.error("Clipboard blocked — select the text below instead");
      });

    if (!navigator.clipboard) {
      setCopyFallback(blob);
      toast.error("Clipboard unavailable — select the text below instead");
    }
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
  const tesla = data.tesla;
  const migrationList = migrations.data?.migrations ?? [];
  const unapplied = migrationList.filter((m) => m.status !== "applied");
  const unsetConfig = Object.entries(data.config).filter(
    ([, v]) => v === false || v === "",
  );
  const deadSources = data.logs.filter((l) => l.level === "error").length;

  // One line saying what to do next, rather than leaving it to be inferred from
  // four separate sections. Ordered by what blocks the most.
  const nextAction =
    !migrations.data?.bootstrapped
      ? "Paste migration 037 into the Supabase SQL editor — nothing else here can run without it."
      : unapplied.length > 0
        ? `Apply ${unapplied.length} migration${unapplied.length > 1 ? "s" : ""}: ${unapplied.map((m) => m.id.slice(0, 3)).join(", ")}.`
        : tesla?.nextStep
          ? `Tesla: set ${tesla.nextStep}.`
          : null;

  function toggle(id: string) {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
  }

  return (
    <div className="space-y-4 p-4 pb-24 lg:p-6">
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
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
          >
            <Copy className="size-4" />
            Raw JSON
          </button>
        </div>
      </div>

      {copyFallback && (
        <section className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Tap inside, select all, copy.</p>
            <button
              onClick={() => setCopyFallback(null)}
              className="flex min-h-11 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <textarea
            readOnly
            value={copyFallback}
            onFocus={(e) => e.currentTarget.select()}
            className="h-48 w-full rounded-lg border border-border bg-muted/40 p-2 font-mono text-[11px]"
          />
        </section>
      )}

      {/* ---- Status: the whole point of opening the page ---- */}
      {nextAction && (
        <section className="rounded-xl border border-primary/40 bg-primary/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Next step</p>
          <p className="mt-1 text-sm">{nextAction}</p>
        </section>
      )}

      {data.roadmap && (
        <section className="space-y-3 rounded-xl border border-border p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Where we are
            </p>
            <p className="mt-0.5 text-sm font-semibold">{data.roadmap.goal}</p>
          </div>
          <ul className="space-y-2.5">
            {data.roadmap.milestones.map((m) => (
              <li key={m.goal} className="flex gap-2.5">
                {m.state === "done" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-400" />
                ) : m.state === "manual" ? (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                )}
                <div className="min-w-0">
                  <p className={`text-sm ${m.state === "done" ? "text-muted-foreground" : ""}`}>
                    {m.goal}
                  </p>
                  {m.state !== "done" && (
                    <p className="text-xs text-muted-foreground">{m.nextStep}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Checked against this deployment where it can be. A dashed circle means it cannot be
            verified from outside and needs a look — see <code>docs/TODO.md</code> for the long
            form.
          </p>
        </section>
      )}

      {data.warnings.length > 0 && (
        <section className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          {data.warnings.map((w, i) => (
            <p key={i} className="flex gap-2 text-sm text-amber-200/90">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              {w}
            </p>
          ))}
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-border p-4">
        {c ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Chargers" value={c.total.toLocaleString()} />
            <Stat label="Operators" value={c.operators.toLocaleString()} bad={c.operators === 0} />
            <Stat label="No country" value={c.no_country.toLocaleString()} bad={c.no_country > 0} />
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
        <div className="flex flex-wrap gap-2">
          {data.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sources have contributed.</p>
          ) : (
            data.sources.map((s) => (
              <span key={s.source} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {s.source}: <span className="font-semibold">{s.rows.toLocaleString()}</span>
              </span>
            ))
          )}
        </div>
      </section>

      {/* ---- Setup ---- */}

      <div className="flex items-start gap-2 pt-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">🚗 Car</h2>
          <p className="text-xs text-muted-foreground">Linking, permissions, the Virtual Key, and what commands did.</p>
        </div>
        <button
          onClick={() => copyReport("car")}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <Copy className="size-3" />
          Report
        </button>
      </div>

      {tesla && (
        <Panel
          title="Go live with Tesla"
          badge={tesla.nextStep ? `next: ${tesla.nextStep}` : "ready"}
          tone={tesla.nextStep ? "warn" : "ok"}
          open={open.tesla ?? false}
          onToggle={() => toggle("tesla")}
        >
          <p className="text-xs text-muted-foreground">
            Ordered — each step is useless without the ones above it. Full procedure in
            <code className="ml-1">docs/VEHICLE-CONNECTION.md</code>.
          </p>
          <ol className="space-y-1.5">
            {tesla.steps.map((s) => (
              <li key={s.step} className="flex gap-2 text-xs">
                {s.ok ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-400" />
                ) : (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className={s.ok ? "text-muted-foreground" : ""}>
                  <span className="font-mono">{s.step}</span>
                  <span className="text-muted-foreground"> — blocks {s.blocks}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Command-signing keypair
            </p>
            <p className="text-xs text-muted-foreground">
              EC P-256, the curve Tesla requires. Generated here because the two
              halves belong in two different places and neither is a shell. Shown
              once and stored nowhere — not in the database, not in a log, not in
              &quot;Copy all&quot;. Close this page and it is gone.
            </p>

            {tesla.grants && tesla.grants.length > 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
                A car is already linked. Replacing the pair means redoing{" "}
                <strong>both</strong> halves in order: public key deployed and
                confirmed served, <em>then</em> Register. Tesla re-fetches
                /.well-known during registration, so registering while the old
                key is still being served just re-registers the old one.
              </p>
            )}

            <IngestButton
              label="Generate keypair"
              busy={running === "keypair"}
              disabled={running !== null}
              onClick={() => void generateKeypair()}
            />

            {keypair && (
              <div className="space-y-3 rounded-md border border-border/60 p-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium">
                    1. Private half → the proxy host
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Single-line base64, the form that survives a control panel
                    storing one line per variable. Set it as{" "}
                    <code>TESLA_PRIVATE_KEY</code>, and make sure it is a runtime
                    variable — a build argument gets printed in the deploy log.
                  </p>
                  <button
                    onClick={() => copyText(keypair.privateKeyBase64, "Private key")}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                  >
                    Copy private key (base64)
                  </button>
                </div>

                <div className="space-y-1 border-t border-border/60 pt-2">
                  <div className="text-xs font-medium">
                    2. Public half → <code>TESLA_PUBLIC_KEY</code> in Vercel
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Served at /.well-known/appspecific/com.tesla.3p.public-key.pem.
                    Deploy this before registering the partner account — Tesla
                    fetches it during registration.
                  </p>
                  <button
                    onClick={() => copyText(keypair.publicKeyPem, "Public key")}
                    className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium"
                  >
                    Copy public key (PEM)
                  </button>
                  <pre className="-mx-1 mt-1 max-h-40 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed">
                    {keypair.publicKeyPem}
                  </pre>
                </div>

                <p className="text-xs text-amber-300">
                  Both halves must come from this same generation. A private key
                  paired with someone else&apos;s public half signs commands the
                  car will refuse.
                </p>
              </div>
            )}
          </div>

          {refusedForKeyNotPaired && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <p className="text-xs font-medium text-destructive">
                The car refused a signed command: our key is not paired to it
              </p>
              <p className="text-xs text-muted-foreground">
                Pairing again will not help if it has already been done. The car
                stores the public key Tesla holds for this domain — so if that
                record is older than the keypair the proxy signs with, the car
                paired a key we no longer own and rejects every signature.
              </p>
              <p className="text-xs text-muted-foreground">
                Press <strong>Check status</strong> below. If{" "}
                <code>servedKeyMatches</code> is <code>false</code>, press{" "}
                <strong>Register</strong> to update Tesla&apos;s record, then pair
                the car once more — in that order.
              </p>
            </div>
          )}

          {tesla.virtualKeyUrl && (
            <div className="space-y-2 border-t border-border/60 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Virtual Key
              </p>
              <p className="text-xs text-muted-foreground">
                The last step, and the only one that happens on the car rather than a
                server. Open this on a phone that has the Tesla app installed and approve —
                it hands our public key to the car, which then accepts signed commands.
                Pointless until the proxy is deployed: without it nothing signs the
                commands, so the car never sees a signature to check.
              </p>
              <a
                href={tesla.virtualKeyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block break-all rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                Pair Virtual Key →
              </a>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                {tesla.virtualKeyUrl}
              </p>
            </div>
          )}

          {tesla.grants && tesla.grants.length > 0 && (
            <div className="space-y-2 border-t border-border/60 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Granted permissions
              </p>
              <p className="text-xs text-muted-foreground">
                Tesla&apos;s consent screen is a tickbox per permission, so a grant can come
                back narrower than what was asked for. Anything missing here was unticked
                during sign-in — reconnect and use &quot;Select all&quot;.
              </p>
              {tesla.grants.map((g) => (
                <div key={g.vehicle} className="space-y-1">
                  <div className="text-xs font-medium">{g.vehicle}</div>
                  <div className="flex flex-wrap gap-1">
                    {g.granted.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-green-500/10 px-1.5 py-0.5 font-mono text-[10px] text-green-400"
                      >
                        {s}
                      </span>
                    ))}
                    {g.missing.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-400 line-through"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Partner account (EU)
            </p>
            <p className="text-xs text-muted-foreground">
              The one setup step with no environment variable behind it, so the list above
              cannot see it. Tesla fetches the public key during registration — check status
              first; register only once the key is being served.
            </p>
            <div className="flex flex-wrap gap-2">
              <IngestButton
                label="Check status"
                busy={running === "partner:status"}
                disabled={running !== null}
                onClick={() => void teslaPartner("status")}
              />
              <IngestButton
                label="Register"
                busy={running === "partner:register"}
                disabled={running !== null}
                onClick={() => void teslaPartner("register")}
              />
            </div>
            {partnerResult != null && (
              <pre className="-mx-4 max-h-72 overflow-auto px-4 text-[11px] leading-relaxed">
                {JSON.stringify(partnerResult, null, 2)}
              </pre>
            )}
          </div>
        </Panel>
      )}

      <Panel
        title="Car activity"
        badge={teslaFresh > 0 ? `${teslaFresh} today` : groupedLogs.tesla.length > 0 ? "older" : "quiet"}
        tone={teslaFresh > 0 ? "warn" : undefined}
        open={open.carLog ?? false}
        onToggle={() => toggle("carLog")}
      >
        <p className="text-xs text-muted-foreground">
          {groupedLogs.total} entries,{" "}
          {groupedLogs.tesla.length + groupedLogs.other.length} distinct, repeats
          collapsed. Split by area because a flat list is always dominated by
          whichever subsystem is noisiest — never the one being debugged.
        </p>
        <LogGroup
          title="Tesla & vehicle"
          entries={groupedLogs.tesla}
          emptyNote="Nothing logged. If you are waiting on a command failure to appear here, that means the command never reached the server — or it worked."
          dayMs={DAY_MS}
          now={generatedAtMs}
        />
      </Panel>

      <div className="flex items-start gap-2 pt-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">⚡ Chargers</h2>
          <p className="text-xs text-muted-foreground">Coverage, imports, source health.</p>
        </div>
        <button
          onClick={() => copyReport("chargers")}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <Copy className="size-3" />
          Report
        </button>
      </div>

      <Panel
        title="Populate chargers"
        badge="import"
        open={open.populate ?? false}
        onToggle={() => toggle("populate")}
      >
        <p className="text-xs text-muted-foreground">
          Country mode fetches OCM plus the national registries. Region mode fetches every
          source, including OpenStreetMap and TomTom. Countries imported in the last 48 h are
          skipped as fresh — clear the cache below to force a re-import.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {COUNTRIES.map((country) => {
            const on = pickedCountries.includes(country.code);
            return (
              <button
                key={country.code}
                onClick={() => toggleCountry(country.code)}
                disabled={running !== null}
                className={`min-h-11 rounded-lg border px-3 text-sm transition-colors disabled:opacity-50 ${
                  on
                    ? "border-primary/50 bg-primary/15 font-semibold text-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {country.name}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <IngestButton
            label={
              pickedCountries.length === 0
                ? "Select at least one"
                : `Fetch ${pickedCountries.length} selected`
            }
            busy={running === "countries"}
            disabled={running !== null || pickedCountries.length === 0}
            onClick={() =>
              void runIngest("countries", { mode: "country", countries: pickedCountries })
            }
          />
          <button
            onClick={() => setPickedCountries(COUNTRIES.map((x) => x.code))}
            disabled={running !== null}
            className="flex min-h-11 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Select all
          </button>
          <button
            onClick={() => setPickedCountries([])}
            disabled={running !== null}
            className="flex min-h-11 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Clear
          </button>
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
      </Panel>

      <Panel
        title="Maintenance"
        badge="dedupe · cache"
        open={open.maintain ?? false}
        onToggle={() => toggle("maintain")}
      >
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Collapses duplicates until nothing is left to merge. New duplicates are prevented at
            ingest, so this is for rows stored before that.
          </p>
          <IngestButton
            label="Collapse duplicates"
            busy={running === "dedupe"}
            disabled={running !== null}
            onClick={() => void runDedupe()}
          />
        </div>
        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            Freshness cache — forgets that an area was imported so the next read re-ingests it
            instead of waiting out the TTL (7 days per tile, 48 hours per country). Deletes no
            stations.
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
        </div>
      </Panel>

      <Panel
        title="Check the sources"
        badge={deadSources > 0 ? `${deadSources} errors logged` : "probe"}
        tone={deadSources > 0 ? "warn" : undefined}
        open={open.sources ?? false}
        onToggle={() => toggle("sources")}
      >
        <p className="text-xs text-muted-foreground">
          Probe queries each source for a small window and counts what came back — the combined
          ingest cannot tell a dead connector from an empty area. Raw shows the upstream
          response verbatim, which is what identifies a format change. Neither writes anything.
        </p>
        <div className="flex flex-wrap gap-2">
          {CORRIDOR.map((r) => (
            <IngestButton
              key={r.label}
              label={r.label}
              busy={running === `probe:${r.label}`}
              disabled={running !== null}
              onClick={() => void runProbe(r)}
            />
          ))}
        </div>
        {probe && (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[420px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Source</th>
                  <th className="py-1.5 pr-3">Rows</th>
                  <th className="py-1.5 pr-3">ms</th>
                  <th className="py-1.5">Sample</th>
                </tr>
              </thead>
              <tbody>
                {probe.map((r) => (
                  <tr key={r.source} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-mono">{r.source}</td>
                    <td
                      className={`py-1.5 pr-3 tabular-nums ${r.count === 0 ? "text-amber-400" : ""}`}
                    >
                      {r.count}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{r.ms}</td>
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
        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Raw upstream response
          </p>
          <div className="flex flex-wrap gap-2">
            {["irve", "ndw", "ndw-nobbox", "austria", "bnetza", "bnetza-openapi"].map((id) => (
              <IngestButton
                key={id}
                label={id}
                busy={running === `raw:${id}`}
                disabled={running !== null}
                onClick={() => void runSourceProbe(id)}
              />
            ))}
          </div>
          {rawProbe != null && (
            <pre className="-mx-4 max-h-72 overflow-auto px-4 text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(rawProbe, null, 2)}
            </pre>
          )}
        </div>
      </Panel>

      <Panel
        title="Charger activity"
        badge={deadSources > 0 ? `${deadSources} failed runs` : `${data.recentRuns.length} runs`}
        tone={deadSources > 0 ? "warn" : undefined}
        open={open.chargerLog ?? false}
        onToggle={() => toggle("chargerLog")}
      >
        <LogGroup
          title="Charger sources"
          entries={groupedLogs.other}
          emptyNote="Nothing logged."
          dayMs={DAY_MS}
          now={generatedAtMs}
        />
        <p className="border-t border-border/60 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ingest runs
        </p>
        {data.recentRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs recorded.</p>
        ) : (
          <div className="-mx-4 max-h-72 overflow-auto px-4">
            <table className="w-full min-w-[420px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">When</th>
                  <th className="py-1.5 pr-3">Source</th>
                  <th className="py-1.5 pr-3">Fetched</th>
                  <th className="py-1.5 pr-3">Upserted</th>
                  <th className="py-1.5">Error</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground">
                      {r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : "—"}
                    </td>
                    <td
                      className={`py-1.5 pr-3 ${r.status === "error" ? "text-destructive" : ""}`}
                    >
                      {r.source ?? "—"}
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
      </Panel>

      <div className="flex items-start gap-2 pt-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">📋 Progress</h2>
          <p className="text-xs text-muted-foreground">Where the project stands, and the database schema.</p>
        </div>
        <button
          onClick={() => copyReport("progress")}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <Copy className="size-3" />
          Report
        </button>
      </div>

      <Panel
        title="Migrations"
        badge={
          !migrations.data?.bootstrapped
            ? "runner missing"
            : unapplied.length > 0
              ? `${unapplied.length} to apply`
              : "all applied"
        }
        tone={unapplied.length > 0 || !migrations.data?.bootstrapped ? "warn" : "ok"}
        open={open.migrations ?? unapplied.length > 0}
        onToggle={() => toggle("migrations")}
      >
        {migrations.data && !migrations.data.bootstrapped && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Runner not installed. Paste <code>supabase/migrations/037_...sql</code> into the
            Supabase SQL editor once; every migration below then applies from here.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <IngestButton
            label="Apply all"
            busy={running === "all-migrations"}
            disabled={running !== null}
            onClick={() => void applyAllMigrations()}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          &quot;Unknown&quot; only means this panel has no record — one you ran by hand shows the
          same. Re-applying is safe; all are idempotent. Order matters for any migration that
          replaces a function, and the runner refuses one that would overwrite a newer
          definition.
        </p>
        <div className="space-y-2">
          {migrationList.map((m) => (
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
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {m.status}
                </span>
                <IngestButton
                  label="Apply"
                  busy={running === m.id}
                  disabled={running !== null}
                  onClick={() => void applyMigration(m.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="pt-2">
        <h2 className="text-sm font-semibold">🔧 Tools</h2>
        <p className="text-xs text-muted-foreground">
          Configuration and one-off probes. No report button — nothing here
          describes a state, it only does things.
        </p>
      </div>

      <Panel
        title="Configuration"
        badge={unsetConfig.length > 0 ? `${unsetConfig.length} unset` : "all set"}
        tone={unsetConfig.length > 0 ? "muted" : "ok"}
        open={open.config ?? false}
        onToggle={() => toggle("config")}
      >
        <p className="text-xs text-muted-foreground">
          Presence only — no key values are ever sent to the browser.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.config).map(([k, v]) => {
            const set = v === true || (typeof v === "string" && v.length > 0);
            return (
              <span
                key={k}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                  set ? "bg-green-500/15 text-green-300" : "bg-muted text-muted-foreground"
                }`}
              >
                {set ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                {k}
                {typeof v === "string" && v.length > 0 && `: ${v}`}
              </span>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Call an API route"
        badge={apiMethod}
        open={open.api ?? false}
        onToggle={() => toggle("api")}
      >
        <p className="text-xs text-muted-foreground">
          Runs a request against this app with your own session and shows the response.
          Useful when a screen looks wrong and the question is whether the API or the UI is
          at fault. A non-JSON response is summarised rather than dumped — a wrong path
          returns the app&apos;s HTML 404, and 200 KB of markup is not an answer.
        </p>
        <div className="flex gap-1.5">
          {(["GET", "POST"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setApiMethod(m)}
              className={`min-h-11 rounded-lg border px-4 font-mono text-xs ${
                apiMethod === m
                  ? "border-primary/50 bg-primary/15"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            "/api/chargers/stats",
            "/api/vehicles",
            "/api/me/capabilities",
            "/api/saved-routes",
            "/api/tariffs/prices",
          ].map((path) => (
            <button
              key={path}
              onClick={() => setApiPath(path)}
              className={`min-h-11 rounded-lg border px-3 font-mono text-xs ${
                apiPath === path
                  ? "border-primary/50 bg-primary/15"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {path.replace("/api/", "")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={apiPath}
            onChange={(e) => setApiPath(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="/api/…"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 font-mono text-xs"
          />
          <IngestButton
            label="Send"
            busy={running === "api"}
            disabled={running !== null}
            onClick={() => void callApi()}
          />
        </div>
        {apiResult != null && (
          <pre className="-mx-4 max-h-72 overflow-auto px-4 text-[11px] leading-relaxed">
            {JSON.stringify(apiResult, null, 2)}
          </pre>
        )}
      </Panel>

      <Panel
        title="Test OCR"
        badge="costs tokens"
        open={open.ocr ?? false}
        onToggle={() => toggle("ocr")}
      >
        <p className="text-xs text-muted-foreground">
          Runs a photo or PDF through the extraction prompt and shows what Claude returned.
          Nothing is saved — no document, no upload, no cost record.
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
          <pre className="-mx-4 max-h-72 overflow-auto px-4 text-[11px]">
            {JSON.stringify(ocrResult, null, 2)}
          </pre>
        )}
      </Panel>

      {/* Results of whatever last ran, kept at the bottom so a long run does not
          push the controls off screen. */}
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

      <p className="text-xs text-muted-foreground">
        Generated {new Date(data.generatedAt).toLocaleString()}. Server-side logs also appear in
        the Vercel dashboard under Logs.
      </p>
    </div>
  );
}

function Panel({
  title,
  badge,
  tone,
  open,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  tone?: "ok" | "warn" | "muted";
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border">
      <button
        onClick={onToggle}
        className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        <span className="text-sm font-semibold">{title}</span>
        {badge && (
          <span
            className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
              tone === "warn"
                ? "bg-amber-500/15 text-amber-300"
                : tone === "ok"
                  ? "bg-green-500/15 text-green-300"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {badge}
          </span>
        )}
      </button>
      {open && <div className="space-y-3 border-t border-border/60 p-4">{children}</div>}
    </section>
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

/**
 * One area's worth of collapsed log entries.
 *
 * Age is stated in relative terms and anything past a day is dimmed, because
 * every entry on this panel was read as a live problem while being two days
 * old. "3 zile" answers a question the absolute timestamp did not.
 */
function LogGroup({
  title,
  entries,
  emptyNote,
  dayMs,
  now,
}: {
  title: string;
  entries: {
    key: string;
    level: "info" | "warn" | "error";
    scope: string;
    message: string;
    context: Record<string, unknown> | null;
    count: number;
    latest: string;
    earliest: string;
  }[];
  emptyNote: string;
  dayMs: number;
  /**
   * The payload's own generation time, not Date.now(). Pure — the lint rule
   * forbids the latter in render — and more honest: ages are relative to when
   * the server read the table, so they do not drift as the page sits open.
   */
  now: number;
}) {
  const fresh = entries.filter((l) => now - new Date(l.latest).getTime() < dayMs);

  return (
    <div className="space-y-1.5 border-t border-border/60 pt-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {entries.length > 0 && (
          <span
            className={`rounded-full px-1.5 text-[10px] tabular-nums ${
              fresh.length > 0
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {fresh.length > 0 ? `${fresh.length} today` : "all older than a day"}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyNote}</p>
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {entries.map((l) => {
            const ageMs = now - new Date(l.latest).getTime();
            const stale = ageMs >= dayMs;
            const days = Math.floor(ageMs / dayMs);
            const hours = Math.floor(ageMs / 3_600_000);
            const mins = Math.floor(ageMs / 60_000);
            const age =
              days >= 1 ? `${days}d ago` : hours >= 1 ? `${hours}h ago` : `${mins}m ago`;
            return (
              <div
                key={l.key}
                className={`rounded-lg p-2 text-xs ${
                  stale ? "bg-muted/20 opacity-60" : "bg-muted/40"
                }`}
              >
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
                  {l.count > 1 && (
                    <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                      ×{l.count}
                    </span>
                  )}
                  <span className="ml-auto tabular-nums text-muted-foreground">{age}</span>
                </div>
                <p className="mt-1 break-words">{l.message}</p>
                {l.context != null && (
                  <pre className="mt-1 overflow-x-auto text-[11px] text-muted-foreground">
                    {JSON.stringify(l.context)}
                  </pre>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(l.latest).toLocaleString()}
                  {l.count > 1 && ` · first ${new Date(l.earliest).toLocaleString()}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
