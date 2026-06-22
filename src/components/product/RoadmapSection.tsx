"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { LANDING_EASE } from "@/lib/animations/variants";

const cardVariant = (i: number) => ({
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: LANDING_EASE, delay: i * 0.08 } },
});

export function RoadmapSection() {
  const t = useTranslations("pricing");

  const items = [
    { icon: "📸", titleKey: "road_photo_title", bodyKey: "road_photo_body" },
    { icon: "🛣️", titleKey: "road_trip_cost_title", bodyKey: "road_trip_cost_body" },
    { icon: "🔋", titleKey: "road_battery_title", bodyKey: "road_battery_body" },
    { icon: "💼", titleKey: "road_mileage_title", bodyKey: "road_mileage_body" },
    { icon: "⛽", titleKey: "road_fuel_title", bodyKey: "road_fuel_body" },
    { icon: "🛡️", titleKey: "road_insurance_title", bodyKey: "road_insurance_body" },
    { icon: "🎫", titleKey: "road_vignette_title", bodyKey: "road_vignette_body" },
    { icon: "🌉", titleKey: "road_tolls_title", bodyKey: "road_tolls_body" },
    { icon: "🧾", titleKey: "road_tax_title", bodyKey: "road_tax_body" },
    { icon: "🔔", titleKey: "road_reminders_title", bodyKey: "road_reminders_body" },
    { icon: "🌦️", titleKey: "road_weather_title", bodyKey: "road_weather_body" },
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
