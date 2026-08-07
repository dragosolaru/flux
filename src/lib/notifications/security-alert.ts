// Owner alert for commands that physically open the car or let it be driven.
//
// The command audit is passive: it records everything, but an owner only finds
// an unlock they did not issue by going to look for it. This pushes the ones
// that matter, so an unexpected unlock arrives rather than waiting to be
// discovered.

import { dispatchNotification } from "@/lib/notifications/dispatch";
import { loadNotificationPreferences, anyChannelEnabled } from "@/lib/notifications/preferences";
import { recordDebugLog } from "@/lib/debug-log";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { CommandName } from "@/types/history";

// Deliberately narrow. Alerting on every command would train the owner to
// ignore the alerts, which costs more than it buys.
const SENSITIVE: ReadonlySet<CommandName> = new Set([
  "unlock",
  "remote_start",
] as CommandName[]);

export function isSensitiveCommand(command: CommandName): boolean {
  return SENSITIVE.has(command);
}

/**
 * Fire-and-forget: a notification failure must never turn a command that the
 * car accepted into an error the owner sees. Callers do not await this.
 */
export function alertOnSensitiveCommand(params: {
  userId: string;
  command: CommandName;
  vehicleName: string;
  success: boolean;
}): void {
  if (!isSensitiveCommand(params.command)) return;
  // A rejected command did not open anything, so it is audit-only.
  if (!params.success) return;

  void (async () => {
    try {
      const prefs = await loadNotificationPreferences(
        createSupabaseAdminClient(),
        params.userId,
      );
      if (!anyChannelEnabled(prefs)) return;

      await dispatchNotification(
        params.userId,
        {
          title: `${params.vehicleName}: ${params.command}`,
          body:
            params.command === "unlock"
              ? "Your car was unlocked from Flux. If this was not you, disconnect Tesla in Settings and change your password."
              : "Remote start was enabled from Flux. If this was not you, disconnect Tesla in Settings and change your password.",
          url: "/commands",
          // Distinct per command so an unlock alert never replaces a remote
          // start alert in the notification tray.
          tag: `security-${params.command}`,
        },
        prefs,
      );
    } catch (err) {
      recordDebugLog("warn", "security-alert", "dispatch failed", {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
