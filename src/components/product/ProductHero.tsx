"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const fadeUp = (delay = 0) => ({
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay } },
});

export function ProductHero() {
  const t = useTranslations("pricing");
  return (
    <section className="px-4 py-24 text-center">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp(0)}
        >
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs text-white/60">
            Everything Flux
          </span>
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          variants={fadeUp(0.08)}
          className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
        >
          {t("product_hero_title")}
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUp(0.16)}
          className="mx-auto mt-4 max-w-2xl text-lg text-white/60"
        >
          {t("product_hero_subtitle")}
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp(0.24)}
          className="mt-8"
        >
          <Link
            href="/register"
            className="inline-block rounded-xl bg-violet-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            {t("getStartedFree")}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
