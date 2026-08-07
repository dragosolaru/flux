// Server-side logging.
//
// Two destinations, on purpose:
//
//   * The platform log (Vercel → Logs) gets everything, as one JSON line per
//     event. Vercel's viewer is a text search over raw output, so a single line
//     of JSON is filterable — `"scope":"ndw"` or `"level":"error"` finds every
//     matching event, where a prettified object would spread across lines and
//     match nothing.
//   * The `debug_logs` table gets the pipeline events worth reviewing later.
//     Each serverless instance keeps its own platform log and Vercel expires
//     them, so a failure one invocation saw is otherwise invisible to the next
//     — and to the phone that is the only screen available on a trip.
//
// Fire-and-forget by design: a logging failure must never surface as the
// caller's failure, and the write must not add latency to a hot path.

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type DebugLevel = "info" | "warn" | "error";

/**
 * One structured line to the platform log. No database write.
 *
 * Use this on request paths — an API route erroring is worth having in Vercel
 * but does not belong in a table a human reviews, and a burst of them would
 * bury the ingest events that do.
 */
export function logServer(
  level: DebugLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    flux: true,
    level,
    scope,
    msg: message,
    ...(context ? { ctx: context } : {}),
  });

  // console.error routes to stderr, which Vercel tags as an error-level log and
  // surfaces above the rest.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Narrow an unknown catch value to something worth logging. */
export function errorContext(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, detail: err.message, stack: err.stack?.split("\n").slice(0, 4) };
  }
  return { detail: String(err) };
}

/**
 * Platform log AND the reviewable table. For pipeline events — ingest,
 * dedupe, source failures — where the point is being able to read them later
 * from the debug panel.
 */
export function recordDebugLog(
  level: DebugLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  logServer(level, scope, message, context);

  void createSupabaseAdminClient()
    .from("debug_logs")
    .insert({ level, scope, message: message.slice(0, 2000), context: context ?? null })
    .then(({ error }) => {
      // Swallow: the table may not exist yet (migration 037 unapplied), and a
      // logging problem must not become the caller's problem.
      if (error) logServer("error", "debug-log", "insert failed", { detail: error.message });
    });
}
