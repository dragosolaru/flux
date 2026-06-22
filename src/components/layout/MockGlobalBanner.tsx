"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { useVehicles, type VehicleListItem } from "@/hooks/useVehicles";

const DISMISSED_KEY = "flux:mock-banner-dismissed";

export function MockGlobalBanner() {
  const t = useTranslations();
  // Lazy initializer is SSR-safe: window is undefined on the server. The banner
  // only renders once the vehicles query resolves (client-only), so reading
  // sessionStorage here cannot cause a hydration mismatch.
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(DISMISSED_KEY) === "1",
  );

  const { data: vehicles } = useVehicles();

  const allMock =
    vehicles != null &&
    vehicles.length > 0 &&
    vehicles.every((v: VehicleListItem) => v.dataSource === "mock");

  const visible = allMock && !dismissed;

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden border-b border-indigo-500/20 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-indigo-500/10"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs sm:text-sm">
            <div className="flex min-w-0 items-center gap-2 text-indigo-200">
              <Sparkles className="size-3.5 shrink-0 text-indigo-300" />
              <span className="truncate">
                <strong className="font-semibold">{t("mock_banner.title")}</strong>
                <span className="text-muted-foreground"> · {t("mock_banner.subtitle")}</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/connect/tesla"
                className="rounded-md bg-indigo-500/20 px-2.5 py-1 text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-500/30 hover:text-indigo-100"
              >
                {t("mock_banner.cta")}
              </Link>
              <button
                onClick={dismiss}
                aria-label={t("common.close")}
                className="rounded p-1 text-indigo-300/70 hover:bg-indigo-500/20 hover:text-indigo-200"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
