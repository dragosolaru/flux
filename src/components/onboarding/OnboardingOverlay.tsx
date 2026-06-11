"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "flux-onboarding-v2";

export function OnboardingOverlay() {
  const t = useTranslations("onboarding_v2");

  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) !== "done",
  );
  const [screen, setScreen] = useState(0);

  function finish() {
    localStorage.setItem(STORAGE_KEY, "done");
    setVisible(false);
  }

  if (!visible) return null;

  const screens = [
    {
      title: t("welcome_title"),
      body: t("welcome_sub"),
      cta: t("welcome_cta"),
      showSkip: true,
    },
    {
      title: t("step_costs_title"),
      body: t("step_costs_body"),
      cta: t("step_costs_cta"),
      showSkip: true,
    },
    {
      title: t("step_trip_title"),
      body: t("step_trip_body"),
      cta: t("step_trip_cta"),
      showSkip: false,
    },
  ];

  const current = screens[screen];

  function handleCta() {
    if (screen < screens.length - 1) {
      setScreen((s) => s + 1);
    } else {
      finish();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -40, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex w-full max-w-xs flex-col items-center"
        >
          <h1 className="text-3xl font-thin tracking-tight text-center">
            {current.title}
          </h1>
          <p className="text-base text-muted-foreground text-center mt-3">
            {current.body}
          </p>

          <button
            onClick={handleCta}
            className="mt-8 h-11 w-full max-w-xs rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {current.cta}
          </button>

          {current.showSkip && (
            <button
              onClick={finish}
              className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("skip")}
            </button>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Page dots */}
      <div className="absolute bottom-12 flex gap-2">
        {screens.map((_, i) => (
          <div
            key={i}
            className={`size-1.5 rounded-full transition-colors ${
              i === screen ? "bg-foreground" : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
