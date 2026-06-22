"use client";

import { Bell, Mail, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Card, SectionHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/hooks/useNotificationPreferences";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import type { NotificationPreferences } from "@/types/notifications";

const SCENARIOS: { key: keyof NotificationPreferences; labelKey: string }[] = [
  { key: "notifyRainWindows", labelKey: "scenario.rain_windows" },
  { key: "notifyFreeze", labelKey: "scenario.freeze" },
  { key: "notifyHeat", labelKey: "scenario.heat" },
  { key: "notifyHail", labelKey: "scenario.hail" },
];

export function NotificationsCard() {
  const t = useTranslations("settings.notifications");
  const { data: prefs } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const push = usePushNotifications();

  if (!prefs) return null;

  function set(patch: Partial<NotificationPreferences>) {
    update.mutate(patch);
  }

  async function onPushToggle(next: boolean) {
    if (next) {
      const ok = await push.subscribe();
      if (!ok) {
        toast.error(t("push_denied"));
        return;
      }
      set({ pushEnabled: true });
    } else {
      await push.unsubscribe();
      set({ pushEnabled: false });
    }
  }

  async function onTest() {
    try {
      await push.sendTest();
      toast.success(t("test_sent"));
    } catch {
      toast.error(t("test_failed"));
    }
  }

  const anyChannel = prefs.pushEnabled || prefs.emailEnabled || prefs.whatsappEnabled;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={t("title")} icon={Bell} />
      <Card className="divide-y divide-border">
        {/* Channels */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Bell className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("channel.push")}</p>
            {!push.isSupported && (
              <p className="text-xs text-muted-foreground">{t("push_unsupported")}</p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {prefs.pushEnabled && push.isSubscribed && (
              <Button type="button" size="sm" variant="outline" onClick={onTest}>
                {t("test")}
              </Button>
            )}
            <Switch
              checked={prefs.pushEnabled}
              disabled={!push.isSupported || push.busy}
              onCheckedChange={onPushToggle}
              aria-label={t("channel.push")}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 px-3 py-2.5">
          <Mail className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("channel.email")}</p>
            <p className="text-xs text-muted-foreground">{t("email_hint")}</p>
          </div>
          <Switch
            className="ml-auto"
            checked={prefs.emailEnabled}
            onCheckedChange={(v) => set({ emailEnabled: v })}
            aria-label={t("channel.email")}
          />
        </div>

        <div className="flex items-center gap-3 px-3 py-2.5">
          <MessageCircle className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("channel.whatsapp")}</p>
            <p className="text-xs text-muted-foreground">{t("whatsapp_hint")}</p>
          </div>
          <Switch
            className="ml-auto"
            checked={prefs.whatsappEnabled}
            onCheckedChange={(v) => set({ whatsappEnabled: v })}
            aria-label={t("channel.whatsapp")}
          />
        </div>

        {/* Scenarios — only meaningful once a channel is on */}
        {anyChannel && (
          <div className="px-3 py-2.5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("scenarios_label")}</p>
            <div className="flex flex-col gap-2">
              {SCENARIOS.map(({ key, labelKey }) => (
                <label key={key} className="flex items-center gap-3">
                  <Switch
                    checked={Boolean(prefs[key])}
                    onCheckedChange={(v) => set({ [key]: v })}
                    aria-label={t(labelKey)}
                  />
                  <span className="text-sm text-foreground">{t(labelKey)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
