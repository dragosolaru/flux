// Server-side log capture for the debug panel.
//
// console.error only reaches the platform log viewer, and each serverless
// instance keeps its own, so a failure one invocation saw is invisible to the
// next. Recording the important ones makes them reviewable in the app.
//
// Fire-and-forget by design: a logging failure must never surface as an ingest
// failure, and the write must not add latency to a hot path. Callers do not
// await it.

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type DebugLevel = "info" | "warn" | "error";

export function recordDebugLog(
  level: DebugLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  // Keep the platform log too — it is the only record if the table is missing.
  const line = `[${scope}] ${message}`;
  if (level === "error") console.error(line, context ?? "");
  else if (level === "warn") console.warn(line, context ?? "");

  void createSupabaseAdminClient()
    .from("debug_logs")
    .insert({ level, scope, message: message.slice(0, 2000), context: context ?? null })
    .then(({ error }) => {
      // Swallow: the table may not exist yet (migration 037 unapplied), and a
      // logging problem must not become the caller's problem.
      if (error) console.error("[debug-log] insert failed:", error.message);
    });
}
