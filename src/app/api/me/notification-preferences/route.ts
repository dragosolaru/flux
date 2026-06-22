import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isNotificationsEnabled } from "@/lib/feature-flags";
import { loadNotificationPreferences } from "@/lib/notifications/preferences";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types/notifications";

const PatchSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  notifyRainWindows: z.boolean().optional(),
  notifyFreeze: z.boolean().optional(),
  notifyHeat: z.boolean().optional(),
  notifyHail: z.boolean().optional(),
});

const COLUMN: Record<keyof z.infer<typeof PatchSchema>, string> = {
  pushEnabled: "push_enabled",
  emailEnabled: "email_enabled",
  whatsappEnabled: "whatsapp_enabled",
  notifyRainWindows: "notify_rain_windows",
  notifyFreeze: "notify_freeze",
  notifyHeat: "notify_heat",
  notifyHail: "notify_hail",
};

export async function GET() {
  if (!isNotificationsEnabled()) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) return NextResponse.json(DEFAULT_NOTIFICATION_PREFERENCES);

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json(DEFAULT_NOTIFICATION_PREFERENCES);

  const supabase = createSupabaseAdminClient();
  const prefs = await loadNotificationPreferences(supabase, userId);
  return NextResponse.json(prefs);
}

export async function PATCH(request: Request) {
  if (!isNotificationsEnabled()) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }
  if (!(await checkRateLimit(userId, "notification-preferences", 30))) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updates[COLUMN[key as keyof z.infer<typeof PatchSchema>]] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: "No updates" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { user_id: userId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
