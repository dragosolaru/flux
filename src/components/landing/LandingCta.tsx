"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Aurora } from "./Aurora";
import {
  landingFadeUp as fadeUp,
  landingStagger as stagger,
} from "@/lib/animations/variants";

export function LandingCta() {
  const t = useTranslations("landing");

  return (
    <section
      className="relative overflow-hidden py-16 text-center md:py-28"
      style={{
        background:
          "radial-gradient(ellipse at 50% 60%, rgba(124,58,237,0.22) 0%, transparent 65%)",
      }}
    >
      <Aurora />
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-4 px-4"
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
          <motion.div
            className="inline-block rounded-2xl"
            animate={{
              boxShadow: [
                "0 0 30px rgba(124,58,237,0.30)",
                "0 0 55px rgba(124,58,237,0.60)",
                "0 0 30px rgba(124,58,237,0.30)",
              ],
            }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            whileHover={{ scale: 1.03 }}
          >
            <Link
              href="/register"
              className="inline-block rounded-2xl bg-violet-600 px-10 py-4 text-base font-semibold text-white transition-colors hover:bg-violet-500"
            >
              {t("cta_button")}
            </Link>
          </motion.div>
        </motion.div>

        <motion.p variants={fadeUp} className="mt-1 text-sm text-white/40">
          {t("hero_free_note")}
        </motion.p>
      </motion.div>
    </section>
  );
}
