import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/tesla/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  vehicleId: z.string().uuid(),
});

/**
 * Internal token-refresh endpoint. Idempotent — calling getValidAccessToken
 * will only hit Tesla if the cached token is about to expire.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("id", parsed.data.vehicleId)
    .maybeSingle();

  if (!vehicle) {
    return NextResponse.json(
      { message: "Vehicle not found" },
      { status: 404 },
    );
  }

  try {
    await getValidAccessToken(vehicle.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
