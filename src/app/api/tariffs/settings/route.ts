import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { DEFAULT_PROVIDER_ID, listProviders } from "@/lib/external/tariffs/registry";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("user_settings")
    .select("tariff_provider")
    .eq("user_id", session.user.id)
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

  const body = await req.json();
  const providerId = typeof body?.providerId === "string" ? body.providerId : null;
  const validIds = listProviders().map((p) => p.id);
  if (!providerId || !validIds.includes(providerId)) {
    return NextResponse.json({ message: "invalid-provider" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  await supabase.from("user_settings").upsert({
    user_id: session.user.id,
    tariff_provider: providerId,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ activeProvider: providerId });
}
