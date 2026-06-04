"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";
import { slideUp } from "@/lib/animations/variants";

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISSED_IOS_KEY = "flux-pwa-ios-dismissed-at";
const IOS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

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
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
    if (isStandalone) return;

    const ios =
      (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
      !("MSStream" in window);

    if (ios) {
      const dismissedAt = localStorage.getItem(DISMISSED_IOS_KEY);
      if (dismissedAt) {
        const elapsed = Date.now() - Number(dismissedAt);
        if (elapsed < IOS_SNOOZE_MS) return;
      }
      queueMicrotask(() => setShow("ios"));
      return;
    }

    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setShow("native");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    if (show === "ios") {
      localStorage.setItem(DISMISSED_IOS_KEY, String(Date.now()));
    } else {
      localStorage.setItem(DISMISSED_KEY, "1");
    }
    setShow("hidden");
  }

  async function install() {
    if (!promptRef.current) return;
    await promptRef.current.prompt();
    await promptRef.current.userChoice;
    dismiss();
  }

  return (
    <AnimatePresence>
      {show !== "hidden" && (
        <motion.div
          className="fixed bottom-20 left-4 right-4 z-[2002] md:hidden"
          variants={slideUp}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-zinc-900 px-4 py-4 shadow-2xl shadow-black/60 ring-1 ring-inset ring-white/5">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/20">
              <Download className="size-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold leading-tight">{t("install_title")}</p>
              {show === "ios" ? (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("ios_hint")}
                </p>
              ) : (
                <button
                  onClick={install}
                  className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:opacity-80"
                >
                  {t("install_cta")}
                </button>
              )}
            </div>
            <button
              onClick={dismiss}
              className="mt-0.5 rounded-lg p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="size-4" />
              <span className="sr-only">{t("install_dismiss")}</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
