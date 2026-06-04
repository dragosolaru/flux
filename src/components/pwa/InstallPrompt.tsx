"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";
import { slideUp } from "@/lib/animations/variants";
import { useInstallPrompt, promptInstall, isStandalone, isIOS } from "@/lib/pwa/use-install-prompt";

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISSED_IOS_KEY = "flux-pwa-ios-dismissed-at";
const IOS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type ShowState = "hidden" | "ios" | "native";

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const { canInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [suppressed, setSuppressed] = useState(false); // standalone or snoozed
  const [iosEligible, setIosEligible] = useState(false);

  // One-time setup: decide iOS eligibility / suppression. setState is deferred
  // via queueMicrotask to keep it out of the effect body.
  useEffect(() => {
    if (isStandalone()) {
      queueMicrotask(() => setSuppressed(true));
      return;
    }
    if (isIOS()) {
      const dismissedAt = localStorage.getItem(DISMISSED_IOS_KEY);
      if (dismissedAt && Date.now() - Number(dismissedAt) < IOS_SNOOZE_MS) {
        queueMicrotask(() => setSuppressed(true));
      } else {
        queueMicrotask(() => setIosEligible(true));
      }
    } else if (localStorage.getItem(DISMISSED_KEY)) {
      queueMicrotask(() => setSuppressed(true));
    }
  }, []);

  // Derive visibility during render so the native banner reacts to canInstall
  // without a setState-in-effect.
  const show: ShowState =
    dismissed || suppressed ? "hidden" : iosEligible ? "ios" : canInstall ? "native" : "hidden";

  function dismiss() {
    if (show === "ios") {
      localStorage.setItem(DISMISSED_IOS_KEY, String(Date.now()));
    } else {
      localStorage.setItem(DISMISSED_KEY, "1");
    }
    setDismissed(true);
  }

  async function install() {
    await promptInstall();
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
