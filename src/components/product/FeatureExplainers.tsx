"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  landingFadeUp as fadeUp,
  landingStagger as stagger,
} from "@/lib/animations/variants";

// BAR_HEIGHTS for 24h smart charge chart
const BAR_HEIGHTS: readonly number[] = [
  18, 20, 36, 36, 36, 22, 15, 14, 17, 19, 22, 24,
  26, 23, 21, 19, 18, 20, 22, 24, 21, 19, 18, 16,
];

// Cheap windows: indices 2-4
const CHEAP_INDICES = new Set([2, 3, 4]);

function AnimatedCostCounter() {
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

function CostVisual() {
  const t = useTranslations("pricing");
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <AnimatedCostCounter />
        <span className="text-2xl text-white/60">/km</span>
        <p className="mt-2 text-sm text-white/40">{t("cost_calc_label")}</p>
      </div>
      <div className="mt-8 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex flex-col gap-2">
          {[80, 60, 90, 50].map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-white/[0.08]" style={{ width: `${w}%` }} />
          ))}
          <div className="mt-1 h-1.5 rounded-full bg-teal-500/30" style={{ width: "45%" }} />
        </div>
      </div>
    </div>
  );
}

function MapVisual() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-8">
      <svg viewBox="0 0 240 160" className="w-full" aria-hidden>
        {/* Grid lines */}
        {[40, 80, 120, 160, 200].map((x) => (
          <line key={`vl-${x}`} x1={x} y1="0" x2={x} y2="160" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        {[40, 80, 120].map((y) => (
          <line key={`hl-${y}`} x1="0" y1={y} x2="240" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        {/* Pins */}
        <circle cx="60" cy="90" r="8" fill="#7c3aed" opacity="0.8" />
        <circle cx="60" cy="90" r="4" fill="#a78bfa" />
        <circle cx="140" cy="55" r="8" fill="#14b8a6" opacity="0.8" />
        <circle cx="140" cy="55" r="4" fill="#5eead4" />
        <circle cx="200" cy="110" r="8" fill="#7c3aed" opacity="0.8" />
        <circle cx="200" cy="110" r="4" fill="#a78bfa" />
      </svg>
      <p className="mt-4 text-center text-xs text-white/40">150,000+ stations · Europe-wide</p>
    </div>
  );
}

function TripVisual() {
  const t = useTranslations("pricing");
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-8">
      <svg viewBox="0 0 240 100" className="w-full" aria-hidden>
        <circle cx="20" cy="80" r="7" fill="#22c55e" />
        <circle cx="110" cy="40" r="7" fill="#7c3aed" />
        <circle cx="220" cy="20" r="7" fill="#ef4444" />
        <polyline
          points="20,80 110,40 220,20"
          fill="none"
          stroke="#7c3aed"
          strokeWidth="1.5"
          strokeDasharray="5 3"
        />
        <text x="90" y="70" fontSize="9" fill="rgba(255,255,255,0.4)">22 min stop</text>
        <text x="180" y="45" fontSize="9" fill="rgba(255,255,255,0.4)">18 min stop</text>
      </svg>
      <div className="mt-4 flex justify-center gap-2">
        {[t("trip_fastest"), t("trip_balanced"), t("trip_economy")].map((label) => (
          <span
            key={label}
            className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-xs text-white/60"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SmartChargeVisual() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-8">
      <svg viewBox="0 0 120 48" className="w-full" aria-hidden>
        {BAR_HEIGHTS.map((h, i) => {
          const isCheap = CHEAP_INDICES.has(i);
          return (
            <motion.rect
              key={i}
              x={i * 5}
              width="3.5"
              rx="1"
              fill={isCheap ? "#14b8a6" : "rgba(255,255,255,0.12)"}
              initial={{ height: 0, y: 48 }}
              whileInView={{ height: h, y: 48 - h }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.02, ease: "easeOut" }}
            />
          );
        })}
      </svg>
      <p className="mt-3 text-center text-xs text-teal-400">
        Best window: Tonight 02:00–04:00 · €0.09/kWh
      </p>
    </div>
  );
}

const BATTERY = 84;
const CIRC = 2 * Math.PI * 30;
const OFFSET = CIRC - (BATTERY / 100) * CIRC;

function CommandsVisual() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-8">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg width="72" height="72" viewBox="0 0 80 80" aria-hidden>
            <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <motion.circle
              cx="40"
              cy="40"
              r="30"
              fill="none"
              stroke="#7c3aed"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              initial={{ strokeDashoffset: CIRC }}
              whileInView={{ strokeDashoffset: OFFSET }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-white">84%</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Battery 84%</p>
          <p className="text-xs text-white/40">340 km range</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["🔒 Locked", "❄️ Climate 22°C", "⚡ Charging 80%"].map((pill) => (
          <span
            key={pill}
            className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs text-white/70"
          >
            {pill}
          </span>
        ))}
      </div>
    </div>
  );
}

interface FeatureBlockProps {
  eyebrow: string;
  title: string;
  body: string;
  subBody?: string;
  visual: React.ReactNode;
  flip?: boolean;
}

function FeatureBlock({ eyebrow, title, body, subBody, visual, flip = false }: FeatureBlockProps) {
  // Title always leads on mobile; the zigzag (flip) applies only at md+.
  return (
    <section className="py-12 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid items-center gap-8 md:grid-cols-2 md:gap-16"
        >
          <motion.div
            variants={fadeUp}
            className={`flex flex-col gap-4 ${flip ? "md:order-2" : ""}`}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">{eyebrow}</p>
            <h2 className="text-3xl font-bold tracking-tight text-white">{title}</h2>
            <p className="leading-relaxed text-white/60">{body}</p>
            {subBody && <p className="text-sm text-white/40">{subBody}</p>}
          </motion.div>

          <motion.div
            variants={fadeUp}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={flip ? "md:order-1" : ""}
          >
            {visual}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export function FeatureExplainers() {
  const t = useTranslations("pricing");

  return (
    <>
      <FeatureBlock
        eyebrow={t("eyebrow_cost")}
        title={t("feat_cost_title")}
        body={t("feat_cost_body")}
        visual={<CostVisual />}
        flip={true}
      />
      <FeatureBlock
        eyebrow={t("eyebrow_map")}
        title={t("feat_map_title")}
        body={t("feat_map_body")}
        visual={<MapVisual />}
        flip={false}
      />
      <FeatureBlock
        eyebrow={t("eyebrow_trip")}
        title={t("feat_trip_title")}
        body={t("feat_trip_body")}
        visual={<TripVisual />}
        flip={true}
      />
      <FeatureBlock
        eyebrow={t("eyebrow_smart")}
        title={t("feat_smart_title")}
        body={t("feat_smart_body")}
        visual={<SmartChargeVisual />}
        flip={false}
      />
      <FeatureBlock
        eyebrow={t("eyebrow_commands")}
        title={t("feat_commands_title")}
        body={t("feat_commands_body")}
        subBody={t("feat_commands_note")}
        visual={<CommandsVisual />}
        flip={true}
      />
    </>
  );
}
