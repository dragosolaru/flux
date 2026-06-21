"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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

function AnimatedCost() {
  const count = useMotionValue(0);
  const [display, setDisplay] = useState("0.000");
  const hasAnimated = useRef(false);

  const formatted = useTransform(count, (v) => v.toFixed(3));

  useEffect(() => {
    return formatted.on("change", setDisplay);
  }, [formatted]);

  return (
    <motion.div
      onViewportEnter={() => {
        if (!hasAnimated.current) {
          hasAnimated.current = true;
          animate(count, 0.043, { duration: 1.5, ease: "easeOut" });
        }
      }}
    >
      <span className="text-6xl font-bold text-teal-400">€{display}</span>
    </motion.div>
  );
}

export function LandingFeatureCost() {
  const t = useTranslations("landing");

  const steps = [
    { icon: "📧", label: "Email your bill" },
    { icon: "🤖", label: "AI reads it" },
    { icon: "📊", label: "Cost per km" },
  ];

  return (
    <section
      className="py-12 md:py-28"
      style={{
        background:
          "linear-gradient(to bottom, transparent, rgba(109,40,217,0.06) 40%, rgba(109,40,217,0.06) 60%, transparent)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid items-center gap-8 md:grid-cols-2 md:gap-14"
        >
          {/* Visual (left) */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-8">
              <div className="flex flex-col items-center gap-2 text-center">
                <AnimatedCost />
                <span className="text-2xl text-white/60">/km</span>
                <p className="mt-2 text-sm text-white/40">{t("feature_cost_stat_label")}</p>
              </div>

              {/* Mini receipt mockup */}
              <div className="mt-8 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-col gap-2">
                  {[80, 60, 90, 50].map((w, i) => (
                    <div
                      key={i}
                      className="h-1.5 rounded-full bg-white/[0.08]"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                  <div className="mt-1 h-1.5 rounded-full bg-teal-500/30" style={{ width: "45%" }} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Text (right) */}
          <motion.div variants={fadeUp} className="flex flex-col gap-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
              Cost Intelligence
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              {t("feature_cost_title")}
            </h2>
            <p className="leading-relaxed text-white/60">
              {t("feature_cost_body")}
            </p>

            {/* Flow diagram */}
            <div className="flex items-center gap-2">
              {steps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xl">
                      {step.icon}
                    </div>
                    <span className="text-xs text-white/50">{step.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="mx-1 mb-4 flex gap-0.5">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <div key={j} className="size-1 rounded-full bg-white/20" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
