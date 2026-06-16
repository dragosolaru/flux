"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "flux-onboarding-v2";

export function OnboardingOverlay() {
  const t = useTranslations("onboarding_v2");

  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) !== "done",
  );
  const [screen, setScreen] = useState(0);
  const reduceMotion = useReducedMotion();
  const slideX = reduceMotion ? 0 : 40;
  const dialogRef = useRef<HTMLDivElement>(null);

  function finish() {
    localStorage.setItem(STORAGE_KEY, "done");
    setVisible(false);
  }

  // Lock body scroll, move focus into the overlay, trap Tab, restore focus on
  // close, and allow Escape to dismiss. Without this a screen-reader / keyboard
  // user (the overlay covers the whole app) can tab to the nav behind it.
  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;

    const focusables = () =>
      dialogRef.current
        ? Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null)
        : [];

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { finish(); return; }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [visible]);

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
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-8"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ x: slideX, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -slideX, opacity: 0 }}
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
      <div className="absolute bottom-12 flex gap-1">
        {screens.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setScreen(i)}
            aria-label={t("step_label", { n: i + 1 })}
            aria-current={i === screen ? "step" : undefined}
            className="flex items-center justify-center p-2"
          >
            <span
              className={`size-1.5 rounded-full transition-colors ${
                i === screen ? "bg-foreground" : "bg-muted-foreground/30"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
