"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const cardVariant = (i: number) => ({
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, delay: i * 0.08 } },
});

const ICONS = ["📸", "🛣️", "🔋", "💼"] as const;

export function RoadmapSection() {
  const t = useTranslations("pricing");

  const items = [
    { icon: ICONS[0], titleKey: "road_photo_title", bodyKey: "road_photo_body" },
    { icon: ICONS[1], titleKey: "road_trip_cost_title", bodyKey: "road_trip_cost_body" },
    { icon: ICONS[2], titleKey: "road_battery_title", bodyKey: "road_battery_body" },
    { icon: ICONS[3], titleKey: "road_mileage_title", bodyKey: "road_mileage_body" },
  ] as const;

  return (
    <section className="py-12 md:py-20">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <h2 className="text-center text-3xl font-bold text-white">{t("roadmap_title")}</h2>
        <p className="mt-2 text-center text-white/50">{t("roadmap_subtitle")}</p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {items.map(({ icon, titleKey, bodyKey }, i) => (
            <motion.div
              key={titleKey}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={cardVariant(i)}
              whileHover={{ y: -6, borderColor: "rgba(45,212,191,0.3)" }}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="text-2xl">{icon}</span>
                <span className="rounded-full bg-teal-400/10 px-2 py-0.5 text-xs text-teal-400">
                  {t("road_coming_soon")}
                </span>
              </div>
              <h3 className="font-semibold text-white">{t(titleKey)}</h3>
              <p className="mt-1 text-sm text-white/50">{t(bodyKey)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
