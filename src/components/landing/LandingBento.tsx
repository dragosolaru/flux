"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { LANDING_EASE } from "@/lib/animations/variants";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

// Static bar heights for 24h price chart (indices 2-4 are cheap hours)
const BAR_HEIGHTS: readonly number[] = [
  18, 20, 36, 36, 36, 22, 15, 14, 17, 19, 22, 24,
  26, 23, 21, 19, 18, 20, 22, 24, 21, 19, 18, 16,
];

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: LANDING_EASE },
  },
};

const BATTERY = 84;
const SMALL_CIRC = 2 * Math.PI * 30;
const SMALL_OFFSET = SMALL_CIRC - (BATTERY / 100) * SMALL_CIRC;

export function LandingBento() {
  const t = useTranslations("landing");

  return (
    <section className="py-8 md:py-14">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
          style={{
            gridTemplateRows: "auto",
          }}
        >
          {/* A — Dashboard Live (col-span-2, row-span-2) */}
          <motion.div
            variants={item}
            whileHover={{ y: -4 }}
            className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 md:col-span-2 md:row-span-2"
            style={{ boxShadow: "0 0 40px rgba(124,58,237,0.08)", minHeight: "200px" }}
          >
            <div className="flex items-start gap-6">
              <div className="relative shrink-0">
                <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden>
                  <circle
                    cx="40"
                    cy="40"
                    r="30"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="6"
                  />
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="30"
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={SMALL_CIRC}
                    initial={{ strokeDashoffset: SMALL_CIRC }}
                    whileInView={{ strokeDashoffset: SMALL_OFFSET }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">84%</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-white">{t("bento_battery")}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-400">
                    <motion.span
                      className="size-1.5 rounded-full bg-teal-400"
                      animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                    />
                    Live
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/50">340 km range · Model 3 LR</p>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-white/40">
                  <span>🔒 Locked</span>
                  <span>❄️ 22°C</span>
                  <span>⚡ Supercharger nearby</span>
                  <span>🔔 Sentry on</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* B — Smart Charge */}
          <motion.div
            variants={item}
            whileHover={{ y: -4 }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5"
            style={{ minHeight: "160px" }}
          >
            <p className="mb-3 text-sm font-semibold text-white">{t("bento_smart_charge")}</p>
            <svg viewBox="0 0 120 48" className="w-full" aria-hidden>
              {BAR_HEIGHTS.map((h, i) => {
                const isCheap = i >= 2 && i <= 4;
                return (
                  <motion.rect
                    key={i}
                    x={i * 5}
                    width="3.5"
                    rx="1"
                    fill={isCheap ? "#14b8a6" : "rgba(255,255,255,0.12)"}
                    initial={{ height: 0, y: 48 }}
                    whileInView={{ height: h, y: 48 - h }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.02, ease: "easeOut" }}
                  />
                );
              })}
            </svg>
            <p className="mt-2 text-xs text-teal-400">Tonight 02:00 · €0.09/kWh</p>
          </motion.div>

          {/* C — Languages */}
          <motion.div
            variants={item}
            whileHover={{ y: -4 }}
            className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5"
            style={{ minHeight: "120px" }}
          >
            <p className="text-sm font-semibold text-white">{t("bento_languages")}</p>
            <div className="flex flex-wrap gap-2">
              {["EN", "RO", "DE", "FR", "HU"].map((lang) => (
                <span
                  key={lang}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/60"
                >
                  {lang}
                </span>
              ))}
            </div>
          </motion.div>

          {/* D — Cost per km */}
          <motion.div
            variants={item}
            whileHover={{ y: -4 }}
            className="flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5"
            style={{ minHeight: "160px" }}
          >
            <div>
              <span className="text-4xl font-bold text-teal-400">€0.043</span>
              <span className="text-lg text-white/60">/km</span>
            </div>
            <p className="text-xs text-white/50">{t("bento_ocr")}</p>
          </motion.div>

          {/* E — Trip Planner */}
          <motion.div
            variants={item}
            whileHover={{ y: -4 }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5"
            style={{ minHeight: "160px" }}
          >
            <p className="mb-3 text-sm font-semibold text-white">{t("bento_trip")}</p>
            <svg viewBox="0 0 120 60" className="w-full" aria-hidden>
              <circle cx="10" cy="50" r="5" fill="#22c55e" />
              <circle cx="60" cy="25" r="4" fill="#7c3aed" />
              <circle cx="110" cy="10" r="5" fill="#ef4444" />
              <polyline
                points="10,50 60,25 110,10"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text x="55" y="42" fontSize="7" fill="rgba(255,255,255,0.4)">
                22 min stop
              </text>
            </svg>
          </motion.div>

          {/* F — Multi-brand */}
          <motion.div
            variants={item}
            whileHover={{ y: -4 }}
            className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5"
            style={{ minHeight: "160px" }}
          >
            <p className="text-sm font-semibold text-white">{t("bento_multi_brand")}</p>
            <div className="flex flex-wrap gap-2">
              {["Tesla", "BMW", "VW", "Hyundai", "Renault", "Kia"].map((b) => (
                <span
                  key={b}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60"
                >
                  {b}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
