"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

const DISMISSED_KEY = "flux-pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type ShowState = "hidden" | "ios" | "native";

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState<ShowState>("hidden");

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
    if (isStandalone) return;

    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
    if (ios) {
      queueMicrotask(() => setShow("ios"));
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setShow("native");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow("hidden");
  }

  async function install() {
    if (!promptRef.current) return;
    await promptRef.current.prompt();
    await promptRef.current.userChoice;
    dismiss();
  }

  if (show === "hidden") return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[2002] md:hidden">
      <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-zinc-900/90 px-4 py-3 shadow-xl backdrop-blur-md">
        <div className="flex-1">
          <p className="text-sm font-semibold">{t("install_title")}</p>
          {show === "ios" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{t("ios_hint")}</p>
          ) : (
            <button
              onClick={install}
              className="mt-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            >
              {t("cta")}
            </button>
          )}
        </div>
        <button onClick={dismiss} className="mt-0.5 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">{t("dismiss")}</span>
        </button>
      </div>
    </div>
  );
}
