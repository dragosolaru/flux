import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { decryptToken } from "@/lib/tesla/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { recordDebugLog } from "@/lib/debug-log";

// Disconnect a Tesla account: revoke the grant at Tesla, then delete the stored
// tokens. Until this existed the only way out was Tesla's own account page, and
// the tokens stayed in our database regardless.
export const maxDuration = 30;

const TESLA_REVOKE_URL = "https://auth.tesla.com/oauth2/v3/revoke";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!(await checkRateLimit(session.user.id, "tesla-disconnect", 20))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: rows, error } = await supabase
    .from("tesla_tokens")
    .select("id, refresh_token_enc")
    .eq("user_id", session.user.id);

  if (error) {
    return NextResponse.json({ message: "Could not read connection" }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, revoked: 0, deleted: 0 });
  }

  // Ask Tesla to invalidate each refresh token. A failure here must not block
  // deletion: leaving a token we can no longer manage is strictly worse than a
  // grant that lingers on Tesla's side, which the owner can still revoke from
  // their Tesla account.
  let revoked = 0;
  for (const row of rows) {
    try {
      const refresh = decryptToken(row.refresh_token_enc);
      const res = await fetch(TESLA_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: refresh,
          token_type_hint: "refresh_token",
          client_id: process.env.TESLA_CLIENT_ID ?? "",
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) revoked++;
      else recordDebugLog("warn", "tesla", `revoke returned ${res.status}`);
    } catch (err) {
      recordDebugLog("warn", "tesla", "revoke request failed", {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const { error: deleteError } = await supabase
    .from("tesla_tokens")
    .delete()
    .eq("user_id", session.user.id);

  if (deleteError) {
    return NextResponse.json({ message: "Could not delete tokens" }, { status: 500 });
  }

  // Vehicles fall back to the simulator rather than being deleted — the owner
  // keeps their trips, costs and documents.
  await supabase
    .from("vehicles")
    .update({ data_source: "mock" })
    .eq("user_id", session.user.id)
    .eq("data_source", "live");

  return NextResponse.json({ ok: true, revoked, deleted: rows.length });
}
