"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function LandingSocialProof() {
  const t = useTranslations("landing");

  const stats = [
    { value: "150K+", label: t("social_stations") },
    { value: "5",     label: t("social_languages") },
    { value: t("social_free_value"), label: t("social_free") },
    { value: "< 2 min", label: t("social_setup") },
  ];

  return (
    <section className="border-y border-white/[0.06] py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-4 text-center md:grid-cols-4 md:px-8"
      >
        {stats.map(({ value, label }) => (
          <div key={label}>
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="mt-1 text-sm text-white/50">{label}</p>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
