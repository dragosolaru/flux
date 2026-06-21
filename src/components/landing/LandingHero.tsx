"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Aurora } from "./Aurora";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.8, duration: 0.7, ease: EASE },
  },
};

export function LandingHero() {
  const t = useTranslations("landing");

  return (
    <section
      className="relative overflow-hidden px-4 py-14 md:py-32"
    >
      <Aurora />
      {/* Animated road SVG */}
      <svg
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 w-full opacity-30"
        preserveAspectRatio="none"
        viewBox="0 0 1200 120"
        aria-hidden
      >
        <motion.path
          d="M 0,100 Q 200,40 400,80 T 800,50 T 1200,70"
          fill="none"
          stroke="#7c3aed"
          strokeWidth="2"
          strokeDasharray="6 4"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
        />
        {[
          { cx: 360, cy: 66 },
          { cx: 660, cy: 55 },
          { cx: 900, cy: 60 },
        ].map((pos, i) => (
          <motion.circle
            key={i}
            cx={pos.cx}
            cy={pos.cy}
            r="5"
            fill="#7c3aed"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.2 + i * 0.3, duration: 0.4 }}
          />
        ))}
      </svg>

      {/* Floating glass card */}
      <motion.div
        variants={cardVariant}
        initial="hidden"
        animate="visible"
        className="absolute right-8 top-1/4 hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl lg:block"
        style={{ maxWidth: "280px" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">Battery</span>
          <span className="text-lg font-bold text-white">84%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-violet-500" style={{ width: "84%" }} />
        </div>
        <p className="mt-3 text-xs text-teal-400">⚡ Charge tonight 02:00–04:00 · €0.09/kWh</p>
        <p className="mt-1 text-xs text-white/50">📍 3 free chargers nearby</p>
      </motion.div>

      {/* Main text content */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
      >
        <motion.div variants={fadeUp}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs text-white/60">
            <Zap className="size-3 text-violet-400" />
            {t("hero_badge")}
          </div>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="text-4xl font-bold tracking-tight text-white md:text-6xl"
        >
          {t("hero_headline")}
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto max-w-2xl text-lg leading-relaxed text-white/60"
        >
          {t("hero_subheadline")}
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <Link
            href="/register"
            className="w-full rounded-xl bg-violet-600 px-8 py-3 text-center font-semibold text-white transition-colors hover:bg-violet-500 sm:w-auto"
          >
            {t("cta_button")}
          </Link>
          <Link
            href="/login"
            className="w-full rounded-xl border border-white/20 px-8 py-3 text-center font-medium text-white transition-colors hover:bg-white/[0.06] sm:w-auto"
          >
            {t("nav_login")}
          </Link>
        </motion.div>

        <motion.p variants={fadeUp} className="text-xs text-white/40">
          {t("hero_free_note")}
        </motion.p>
      </motion.div>
    </section>
  );
}
