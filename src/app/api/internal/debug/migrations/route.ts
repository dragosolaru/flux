import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { MIGRATIONS, findMigration } from "@/lib/migrations/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// One-tap application of a migration from the server-side registry.
//
// The body carries an id, never SQL. There is no path from a client to
// arbitrary statements: exec_sql is only ever handed a body that was committed
// to the repository and reviewed.
export const maxDuration = 120;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("applied_migrations")
    .select("id, applied_at, applied_by");

  // Missing table means migration 037 has not been pasted in yet.
  const bootstrapped = !error;
  const applied = new Map((data ?? []).map((r) => [r.id, r]));

  return NextResponse.json({
    bootstrapped,
    migrations: MIGRATIONS.map((m) => ({
      id: m.id,
      description: m.description,
      // "unknown" rather than "pending": a migration applied by hand in the SQL
      // editor leaves no record here, and claiming it is missing would be wrong.
      status: applied.has(m.id) ? "applied" : "unknown",
      appliedAt: applied.get(m.id)?.applied_at ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  if (!(await checkRateLimit(admin.userId, "debug-migrate", 30))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = z
    .object({ id: z.string().min(1).max(120) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body" }, { status: 422 });
  }

  const migration = findMigration(parsed.data.id);
  if (!migration) {
    return NextResponse.json({ message: "Unknown migration" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("exec_sql", { p_sql: migration.sql });

  if (error) {
    return NextResponse.json(
      {
        message: "Migration failed",
        // Surfaced verbatim: this is the whole point of running it from here
        // instead of the SQL editor.
        error: error.message,
        hint:
          error.message.includes("exec_sql")
            ? "Apply migration 037 in the Supabase SQL editor first — it creates the runner."
            : undefined,
      },
      { status: 500 },
    );
  }

  await supabase
    .from("applied_migrations")
    .upsert({ id: migration.id, applied_by: admin.email }, { onConflict: "id" });

  return NextResponse.json({ ok: true, id: migration.id });
}
