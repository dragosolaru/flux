"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";

import { staggerContainer, fadeInUp } from "@/lib/animations/variants";

interface LandingHeroProps {
  headline: string;
  subheadline: string;
  ctaLabel: string;
  ctaPricingLabel: string;
  badgeLabel: string;
}

export function LandingHero({
  headline,
  subheadline,
  ctaLabel,
  ctaPricingLabel,
  badgeLabel,
}: LandingHeroProps) {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24 text-center">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center gap-6"
      >
        <motion.div variants={fadeInUp}>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
            <Zap className="size-3 text-primary" />
            {badgeLabel}
          </div>
        </motion.div>

        <motion.h1
          variants={fadeInUp}
          className="text-4xl font-bold tracking-tight lg:text-6xl"
        >
          {headline}
        </motion.h1>

        <motion.p
          variants={fadeInUp}
          className="mx-auto max-w-2xl text-lg text-muted-foreground"
        >
          {subheadline}
        </motion.p>

        <motion.div
          variants={fadeInUp}
          className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <Link
            href="/register"
            className="w-full rounded-xl bg-gradient-to-r from-primary to-primary/90 px-8 py-3 text-center text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
          >
            {ctaLabel}
          </Link>
          <Link
            href="/pricing"
            className="w-full rounded-xl border border-border px-8 py-3 text-center text-sm font-medium transition-colors hover:bg-muted/40 sm:w-auto"
          >
            {ctaPricingLabel}
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
