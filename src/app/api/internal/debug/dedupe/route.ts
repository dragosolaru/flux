import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Runs the batched dedupe until it stops finding duplicates, so the operator
// does not have to re-issue the same statement by hand. Bounded by both a pass
// count and a wall clock so it always returns rather than being killed.
export const maxDuration = 300;

const BATCH = 2000;
const MAX_PASSES = 40;
const BUDGET_MS = 240_000;

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  if (!(await checkRateLimit(admin.userId, "debug-dedupe", 20))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();
  const startedAt = Date.now();
  const passes: number[] = [];
  let total = 0;

  for (let i = 0; i < MAX_PASSES; i++) {
    if (Date.now() - startedAt > BUDGET_MS) break;

    // Two passes with different rules: same-operator duplicates (034) and one
    // site under several operator names (038). Running both here means the
    // button means "collapse duplicates", not "collapse one kind of duplicate".
    const [byOperator, byName] = await Promise.all([
      supabase.rpc("dedupe_chargers_batch", { p_limit: BATCH }),
      supabase.rpc("dedupe_same_site_names", { p_limit: BATCH }),
    ]);
    const error = byOperator.error ?? byName.error;
    const data =
      (typeof byOperator.data === "number" ? byOperator.data : 0) +
      (typeof byName.data === "number" ? byName.data : 0);
    if (error) {
      const hint = error.message.includes("dedupe_chargers_batch")
        ? " — apply migration 034 first"
        : error.message.includes("dedupe_same_site_names")
          ? " — apply migration 038 first"
          : "";
      return NextResponse.json(
        { message: `${error.message}${hint}`, deletedBefore: total, passes },
        { status: 500 },
      );
    }

    const deleted = typeof data === "number" ? data : 0;
    passes.push(deleted);
    total += deleted;
    if (deleted === 0) break;
  }

  const complete = passes.length > 0 && passes[passes.length - 1] === 0;

  return NextResponse.json({
    deleted: total,
    passes,
    complete,
    elapsedMs: Date.now() - startedAt,
    // Not complete means the budget or pass cap ran out with duplicates still
    // being found; running it again picks up where this left off.
    note: complete ? "No duplicates remain." : "Budget reached — run again to continue.",
  });
}
