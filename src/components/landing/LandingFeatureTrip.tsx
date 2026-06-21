"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

export function LandingFeatureTrip() {
  const t = useTranslations("landing");

  const chips = ["Fastest", "Balanced", "Economy"];

  return (
    <section className="py-12 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid items-center gap-8 md:grid-cols-2 md:gap-14"
        >
          {/* Text (left) */}
          <motion.div variants={fadeUp} className="flex flex-col gap-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
              Trip Planner
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              {t("feature_trip_title")}
            </h2>
            <p className="leading-relaxed text-white/60">
              {t("feature_trip_body")}
            </p>
            <div className="flex gap-2">
              {chips.map((chip, i) => (
                <div
                  key={chip}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                    i === 0
                      ? "bg-violet-600 text-white"
                      : "border border-white/15 text-white/50"
                  }`}
                >
                  {chip}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Visual (right) */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
              {/* Route SVG */}
              <svg
                viewBox="0 0 340 200"
                className="w-full"
                aria-hidden
              >
                <motion.path
                  d="M 40,160 C 100,100 120,60 170,80 C 220,100 240,50 300,40"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="2"
                  strokeDasharray="5 3"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                />

                {/* Origin */}
                <circle cx="40" cy="160" r="6" fill="#22c55e" />
                <text x="50" y="175" fontSize="10" fill="rgba(255,255,255,0.6)">
                  Cluj-Napoca
                </text>

                {/* Stop 1 */}
                <motion.circle
                  cx="170"
                  cy="80"
                  r="5"
                  fill="#7c3aed"
                  initial={{ opacity: 0, scale: 0 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.8 }}
                />
                <text x="120" y="72" fontSize="9" fill="rgba(255,255,255,0.5)">
                  22 min · 150 kW
                </text>

                {/* Stop 2 */}
                <motion.circle
                  cx="240"
                  cy="55"
                  r="5"
                  fill="#7c3aed"
                  initial={{ opacity: 0, scale: 0 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.1 }}
                />
                <text x="200" y="48" fontSize="9" fill="rgba(255,255,255,0.5)">
                  18 min · 50 kW
                </text>

                {/* Destination */}
                <circle cx="300" cy="40" r="6" fill="#ef4444" />
                <text x="252" y="30" fontSize="10" fill="rgba(255,255,255,0.6)">
                  București
                </text>
              </svg>

              <p className="mt-4 text-center text-xs text-white/40">
                Total: 6h 42min · 2 stops · €4.20
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
