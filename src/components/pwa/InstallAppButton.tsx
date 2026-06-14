"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Download } from "lucide-react";
import { useInstallPrompt, promptInstall } from "@/lib/pwa/use-install-prompt";

export function InstallAppButton() {
  const t = useTranslations("pwa");
  const { canInstall, isInstalled, isIOSDevice } = useInstallPrompt();

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-400">
        <CheckCircle2 className="size-4" />
        {t("installed")}
      </span>
    );
  }

  if (canInstall) {
    return (
      <button
        onClick={() => void promptInstall()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:opacity-80"
      >
        <Download className="size-3.5" />
        {t("install_cta")}
      </button>
    );
  }

  return (
    <span className="text-xs leading-relaxed text-muted-foreground">
      {isIOSDevice ? t("ios_hint") : t("unsupported_hint")}
    </span>
  );
}
