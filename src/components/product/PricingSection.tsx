"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { UpgradeButton } from "@/components/billing/UpgradeButton";

interface PricingSectionProps {
  currentTier: "free" | "pro";
  isLoggedIn: boolean;
}

const MONTHLY_PRICE = 4.99;
const ANNUAL_MONTHLY_PRICE = 3.25;

const FREE_FEATURE_KEYS = [
  "feat_free_map",
  "feat_free_trip",
  "feat_free_smart",
  "feat_free_tariff",
  "feat_free_dashboard",
  "feat_free_ocr",
  "feat_free_history",
  "feat_free_vehicles",
] as const;

const PRO_FEATURE_KEYS = [
  "feat_pro_history",
  "feat_pro_insights",
  "feat_pro_ocr",
  "feat_pro_vehicles",
  "feat_pro_battery",
  "feat_pro_whatsapp",
  "feat_pro_export",
  "feat_pro_digest",
  "feat_pro_support",
] as const;

export function PricingSection({ currentTier, isLoggedIn }: PricingSectionProps) {
  const t = useTranslations("pricing");
  const [annual, setAnnual] = useState(true);

  const price = annual ? ANNUAL_MONTHLY_PRICE : MONTHLY_PRICE;

  return (
    <section id="pricing" className="py-20">
      <div className="mx-auto max-w-4xl px-4 md:px-8">
        <h2 className="text-center text-3xl font-bold text-white">{t("pricing_section_title")}</h2>
        <p className="mt-2 text-center text-white/50">{t("pricing_section_subtitle")}</p>

        {/* Toggle */}
        <div className="mt-8 flex justify-center">
          <div className="flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.04] p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                !annual ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {t("monthly_label")}
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors ${
                annual ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {t("annual_label")}
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-400">
                {t("annual_save_badge")}
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col rounded-2xl border border-white/[0.1] bg-white/[0.03] p-6">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white">{t("freeTier")}</h3>
              <p className="mt-1 text-sm text-white/50">{t("freeDesc")}</p>
              <div className="mt-4">
                <span className="text-4xl font-bold text-white">€0</span>
                <span className="text-white/50"> {t("perMonth")}</span>
              </div>
            </div>

            <ul className="mb-8 flex-1 space-y-3">
              {FREE_FEATURE_KEYS.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-white/70">
                  <CheckCircle2 size={16} className="shrink-0 text-white/40" />
                  {t(k)}
                </li>
              ))}
            </ul>

            {isLoggedIn ? (
              <div className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-center text-sm text-white/40">
                {currentTier === "free" ? t("currentPlan") : t("includedInPro")}
              </div>
            ) : (
              <Link
                href="/register"
                className="rounded-xl border border-white/[0.15] px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-white/[0.05]"
              >
                {t("getStartedFree")}
              </Link>
            )}
          </div>

          {/* Pro */}
          <div
            className="flex flex-col rounded-2xl border-2 border-violet-500/50 bg-gradient-to-b from-violet-950/30 to-transparent p-6"
            style={{ boxShadow: "0 0 40px rgba(124,58,237,0.12)" }}
          >
            <div className="mb-6">
              <div className="mb-2 inline-flex items-center rounded-full bg-violet-100/10 px-3 py-1 text-xs font-medium text-violet-400">
                {t("mostPopular")}
              </div>
              <h3 className="text-xl font-semibold text-white">{t("proTier")}</h3>
              <p className="mt-1 text-sm text-white/50">{t("proDesc")}</p>
              <div className="mt-4 flex items-baseline gap-2">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={price}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                    className="text-4xl font-bold text-white"
                  >
                    €{price.toFixed(2)}
                  </motion.span>
                </AnimatePresence>
                <span className="text-white/50">{t("perMonth")}</span>
              </div>
              {annual && (
                <p className="mt-1 text-xs text-white/40">{t("annual_note")}</p>
              )}
            </div>

            <p className="mb-3 text-xs text-white/40">{t("free_includes")}</p>

            <ul className="mb-8 flex-1 space-y-3">
              {PRO_FEATURE_KEYS.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-white/80">
                  <CheckCircle2 size={16} className="shrink-0 text-violet-400" />
                  {t(k)}
                </li>
              ))}
            </ul>

            {isLoggedIn ? (
              currentTier === "pro" ? (
                <div className="rounded-xl bg-violet-500/10 px-4 py-2.5 text-center text-sm font-medium text-violet-400">
                  {t("currentPlan")}
                </div>
              ) : (
                <UpgradeButton
                  tier={annual ? "pro_annual" : "pro"}
                  className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
                />
              )
            ) : (
              <Link
                href="/register"
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-violet-500"
              >
                {t("getStarted")}
              </Link>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">{t("trust_stripe")}</p>
      </div>
    </section>
  );
}
