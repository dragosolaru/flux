"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function LandingCta() {
  const t = useTranslations("landing");

  return (
    <section
      className="relative overflow-hidden py-32 text-center"
      style={{
        background:
          "radial-gradient(ellipse at 50% 60%, rgba(124,58,237,0.22) 0%, transparent 65%)",
      }}
    >
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="relative mx-auto flex max-w-2xl flex-col items-center gap-4 px-4"
      >
        <motion.h2
          variants={fadeUp}
          className="text-4xl font-bold tracking-tight text-white md:text-5xl"
        >
          {t("cta_title")}
        </motion.h2>

        <motion.p variants={fadeUp} className="mt-2 max-w-md text-lg text-white/60">
          {t("cta_subtitle")}
        </motion.p>

        <motion.div variants={fadeUp} className="mt-4">
          <Link
            href="/register"
            className="inline-block rounded-2xl bg-violet-600 px-10 py-4 text-base font-semibold text-white transition-colors hover:bg-violet-500"
            style={{ boxShadow: "0 0 40px rgba(124,58,237,0.4)" }}
          >
            {t("cta_button")}
          </Link>
        </motion.div>

        <motion.p variants={fadeUp} className="mt-1 text-sm text-white/40">
          {t("hero_free_note")}
        </motion.p>
      </motion.div>
    </section>
  );
}
