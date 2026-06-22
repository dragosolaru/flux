import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/types/notifications";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface PrefsRow {
  push_enabled: boolean;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  notify_rain_windows: boolean;
  notify_freeze: boolean;
  notify_heat: boolean;
  notify_hail: boolean;
}

export function rowToPreferences(row: PrefsRow | null): NotificationPreferences {
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return {
    pushEnabled: row.push_enabled,
    emailEnabled: row.email_enabled,
    whatsappEnabled: row.whatsapp_enabled,
    notifyRainWindows: row.notify_rain_windows,
    notifyFreeze: row.notify_freeze,
    notifyHeat: row.notify_heat,
    notifyHail: row.notify_hail,
  };
}

export async function loadNotificationPreferences(
  supabase: AdminClient,
  userId: string,
): Promise<NotificationPreferences> {
  const { data } = await supabase
    .from("notification_preferences")
    .select(
      "push_enabled, email_enabled, whatsapp_enabled, notify_rain_windows, notify_freeze, notify_heat, notify_hail",
    )
    .eq("user_id", userId)
    .maybeSingle();

  return rowToPreferences(data as PrefsRow | null);
}

export function anyChannelEnabled(prefs: NotificationPreferences): boolean {
  return prefs.pushEnabled || prefs.emailEnabled || prefs.whatsappEnabled;
}
