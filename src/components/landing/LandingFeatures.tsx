"use client";

import { motion } from "framer-motion";
import { ScanLine, BatteryCharging, Globe, Gauge, type LucideIcon } from "lucide-react";

import { staggerContainer, fadeInUp } from "@/lib/animations/variants";

type IconName = "ScanLine" | "BatteryCharging" | "Globe" | "Gauge";

const ICON_MAP: Record<IconName, LucideIcon> = {
  ScanLine,
  BatteryCharging,
  Globe,
  Gauge,
};

interface Feature {
  icon: IconName;
  title: string;
  desc: string;
}

interface LandingFeaturesProps {
  features: Feature[];
}

export function LandingFeatures({ features }: LandingFeaturesProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {features.map(({ icon, title, desc }) => {
        const Icon = ICON_MAP[icon];
        return (
          <motion.div
            key={title}
            variants={fadeInUp}
            className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/5 p-6 backdrop-blur-sm"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {desc}
            </p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
