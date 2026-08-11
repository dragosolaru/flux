"use client";

import { useTranslations } from "next-intl";

import type { CommandName } from "@/types/history";

/**
 * Commands that physically open the car or let it be driven.
 *
 * Client-safe on purpose. `src/lib/notifications/security-alert.ts` already
 * exports `isSensitiveCommand()`, but it imports the Supabase admin client, so
 * no component can use it — which is how the same set came to be written out
 * by hand in two more places. Three copies of a security-relevant list, and the
 * natural home for a new entry is the server one, so the UIs would have been
 * the copies left behind.
 */
export const SENSITIVE_COMMANDS: ReadonlySet<CommandName> = new Set([
  "unlock",
  "remote_start",
]);

/**
 * The confirmation step for those commands.
 *
 * Extracted because it was byte-identical in CommandPanel and AllCommands —
 * every class string the same — and neither copy traps focus or handles
 * Escape. Two bugs to fix instead of one is the cost that made this worth a
 * file; the button rendering around it is genuinely cheaper duplicated.
 *
 * Destructive action on the left, so the easy right-thumb target is Cancel.
 */
export function ConfirmCommandDialog({
  command,
  onConfirm,
  onCancel,
}: {
  command: CommandName | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("commands");
  const tc = useTranslations("common");
  if (!command) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-4 shadow-2xl"
      >
        <p className="text-sm font-semibold text-foreground">{t(`confirm.${command}.title`)}</p>
        <p className="text-sm text-muted-foreground">{t(`confirm.${command}.body`)}</p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-destructive px-3 text-sm font-semibold text-destructive-foreground"
          >
            {t(`confirm.${command}.action`)}
          </button>
          <button
            autoFocus
            onClick={onCancel}
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted"
          >
            {tc("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
