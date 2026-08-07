"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";

interface TeslaConnectionCardProps {
  /** True when at least one vehicle is on live Tesla data. */
  connected: boolean;
}

/**
 * Disconnecting a Tesla account. Until this existed the only way out was
 * Tesla's own account page, and our stored tokens survived that — so an owner
 * could revoke the grant and still see credentials sitting in our database.
 */
export function TeslaConnectionCard({ connected }: TeslaConnectionCardProps) {
  const t = useTranslations("settings.tesla");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const disconnect = useMutation({
    // Raw fetch rather than apiFetch: the useful part of the response is the
    // revoked/deleted counts, and a 401 here should surface as an error rather
    // than bouncing to /login mid-disconnect.
    mutationFn: async () => {
      const res = await fetch("/api/tesla/connection", { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text().catch(() => "failed"));
      return res.json() as Promise<{ revoked: number; deleted: number }>;
    },
    onSuccess: (r) => {
      setConfirming(false);
      toast.success(t("disconnected", { count: r.deleted }));
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: () => toast.error(t("disconnect_error")),
  });

  if (!connected) {
    return <p className="text-sm text-muted-foreground">{t("not_connected")}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("connected_description")}</p>

      {confirming ? (
        <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-foreground">{t("disconnect_confirm")}</p>
          <div className="flex gap-2">
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-3 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {disconnect.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("disconnect_action")}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={disconnect.isPending}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted"
            >
              {tc("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Unplug className="size-4" />
          {t("disconnect")}
        </button>
      )}
    </div>
  );
}
