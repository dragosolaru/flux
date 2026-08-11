import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { recordDebugLog } from "@/lib/debug-log";

/**
 * Row-level-security state, and the button that fixes it.
 *
 * Exists because the answer to a Supabase `rls_disabled_in_public` alert was
 * otherwise only readable by pasting SQL into their editor, which is not a
 * thing you can do from a phone — and a phone is where this app is operated.
 * The migration that backs it (048) returns rows for the same reason: the
 * panel applies migrations through `exec_sql`, which returns void.
 *
 * GET  — what is exposed, plus who can write to it.
 * POST — enable RLS on everything we own that lacks it.
 */
export const dynamic = "force-dynamic";

interface RlsRow {
  table_name: string;
  rls_enabled: boolean;
  owner: string;
  owned_by_extension: boolean;
}

/** Postgres says "does not exist" for a function that was never created. */
function needsMigration(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache/i.test(message));
}

const MIGRATION_HINT =
  "Apply migration 048_enable_rls_everywhere from the Migrations section above, then check again.";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("debug_rls_status");

  if (error) {
    return NextResponse.json({
      available: false,
      message: error.message,
      ...(needsMigration(error.message) ? { hint: MIGRATION_HINT } : {}),
    });
  }

  const rows = (data ?? []) as RlsRow[];
  const exposed = rows.filter((r) => !r.rls_enabled);

  // Only for what is actually exposed, and only for the roles that matter.
  // Reading EPSG constants is harmless; a DELETE on spatial_ref_sys would break
  // every coordinate transform the charger map depends on, so the write
  // privileges are the part worth showing.
  const grants = await Promise.all(
    exposed.map(async (r) => {
      const { data: g } = await supabase.rpc("debug_table_grants", { p_table: r.table_name });
      return {
        table: r.table_name,
        owner: r.owner,
        ownedByExtension: r.owned_by_extension,
        grants: (g ?? []) as { grantee: string; privileges: string }[],
      };
    }),
  );

  const writable = grants.filter((g) =>
    g.grants.some((x) => /INSERT|UPDATE|DELETE|TRUNCATE/.test(x.privileges)),
  );

  return NextResponse.json({
    available: true,
    total: rows.length,
    withRls: rows.length - exposed.length,
    exposed: grants,
    verdict:
      exposed.length === 0
        ? "Every table in public has RLS enabled."
        : writable.length > 0
          ? `${writable.map((w) => w.table).join(", ")} can be WRITTEN by anon or authenticated. That is worth closing even if the data is not yours.`
          : exposed.every((r) => r.owned_by_extension)
            ? "Only extension-owned tables are exposed, and none of them are writable by anon. This is the known PostGIS case — reference data, no user data, not alterable by us."
            : "Exposed tables are read-only for anon. Run the sweep to enable RLS on the ones we own.",
  });
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  if (!(await checkRateLimit(admin.userId, "debug-rls", 20))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("debug_enable_rls_everywhere");

  if (error) {
    return NextResponse.json(
      {
        message: error.message,
        ...(needsMigration(error.message) ? { hint: MIGRATION_HINT } : {}),
      },
      { status: 500 },
    );
  }

  const changes = (data ?? []) as { table_name: string; action: string }[];
  if (changes.some((c) => c.action === "RLS enabled")) {
    recordDebugLog("warn", "debug/rls", "RLS was enabled on tables that lacked it", {
      tables: changes.filter((c) => c.action === "RLS enabled").map((c) => c.table_name),
    });
  }

  return NextResponse.json({
    changes,
    // An empty list is the expected result once the schema is clean, and it
    // reads as a failure unless something says otherwise.
    summary:
      changes.length === 0
        ? "Nothing to do — every table already has RLS."
        : `${changes.filter((c) => c.action === "RLS enabled").length} enabled, ${changes.filter((c) => c.action.startsWith("skipped")).length} skipped.`,
  });
}
