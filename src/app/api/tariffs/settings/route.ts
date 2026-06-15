import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { DEFAULT_PROVIDER_ID, listProviders } from "@/lib/external/tariffs/registry";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("user_settings")
    .select("tariff_provider")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({
    activeProvider: data?.tariff_provider ?? DEFAULT_PROVIDER_ID,
    providers: listProviders().map((p) => ({ id: p.id, displayName: p.displayName })),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  if (!await checkRateLimit(userId, "tariff-settings", 20)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();
  const providerId = typeof body?.providerId === "string" ? body.providerId : null;
  const validIds = listProviders().map((p) => p.id);
  if (!providerId || !validIds.includes(providerId)) {
    return NextResponse.json({ message: "invalid-provider" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    tariff_provider: providerId,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[tariffs/settings/PUT]", error.message);
    return NextResponse.json({ message: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ activeProvider: providerId });
}
