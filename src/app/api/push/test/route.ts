import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/lib/auth";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { isNotificationsEnabled } from "@/lib/feature-flags";
import { sendPushToUser } from "@/lib/push/send";
import { translateNotification } from "@/lib/i18n/notify";
import { LOCALE_COOKIE } from "@/lib/i18n/config";

export async function POST() {
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
  if (!(await checkRateLimit(userId, "push-test", 10))) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const locale = (await cookies()).get(LOCALE_COOKIE)?.value ?? null;
  const [title, body] = await Promise.all([
    translateNotification(locale, "test.title"),
    translateNotification(locale, "test.body"),
  ]);

  await sendPushToUser(userId, { title, body, url: "/dashboard", tag: "test" });
  return NextResponse.json({ ok: true });
}
