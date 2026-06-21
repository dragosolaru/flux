"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import {
  landingFadeUp as fadeUp,
  landingStagger as stagger,
} from "@/lib/animations/variants";

export function LandingFeatureVehicle() {
  const t = useTranslations("landing");

  const bullets = [
    t("vehicle_bullet_1"),
    t("vehicle_bullet_2"),
    t("vehicle_bullet_3"),
  ];

  const BATTERY = 84;
  const CIRCUMFERENCE = 2 * Math.PI * 60;
  const offset = CIRCUMFERENCE - (BATTERY / 100) * CIRCUMFERENCE;

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
          {/* Text */}
          <motion.div variants={fadeUp} className="flex flex-col gap-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
              {t("eyebrow_vehicle")}
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              {t("feature_vehicle_title")}
            </h2>
            <p className="leading-relaxed text-white/60">
              {t("feature_vehicle_body")}
            </p>
            <ul className="flex flex-col gap-3">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-3 text-sm text-white/70">
                  <Check className="size-4 shrink-0 text-violet-400" />
                  {bullet}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Visual */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div
              className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-8"
              style={{ boxShadow: "0 0 40px rgba(124,58,237,0.08)" }}
            >
              <div className="flex flex-col items-center gap-6">
                {/* Battery ring */}
                <div className="relative">
                  <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden>
                    <defs>
                      <linearGradient id="battGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#a78bfa" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="80"
                      cy="80"
                      r="60"
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="10"
                    />
                    <motion.circle
                      cx="80"
                      cy="80"
                      r="60"
                      fill="none"
                      stroke="url(#battGrad)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={CIRCUMFERENCE}
                      initial={{ strokeDashoffset: CIRCUMFERENCE }}
                      whileInView={{ strokeDashoffset: offset }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
                      transform="rotate(-90 80 80)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-white">84%</span>
                    <span className="text-sm text-white/50">Battery</span>
                  </div>
                </div>

                {/* Status chips */}
                <div className="flex gap-3 text-xs">
                  {[
                    { icon: "🔒", label: "Locked" },
                    { icon: "❄️", label: "22°C" },
                    { icon: "🔔", label: "Sentry" },
                  ].map(({ icon, label }) => (
                    <div
                      key={label}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/60"
                    >
                      <span>{icon}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
