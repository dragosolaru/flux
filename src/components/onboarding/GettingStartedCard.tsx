"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
import { cardVariants } from "@/lib/animations/variants";

const DISMISSED_KEY = "onboarding-dismissed";

export interface ChecklistData {
  hasVehicle: boolean;
  hasDocument: boolean;
  hasHomeLocation: boolean;
  hasMockVehicle: boolean;
}

interface Props {
  data: ChecklistData;
}

export function GettingStartedCard({ data }: Props) {
  const t = useTranslations("getting_started");
  // Avoid SSR/hydration mismatch — reveal only after mount.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) !== "true") {
      queueMicrotask(() => setVisible(true));
    }
  }, []);

  const steps = [
    { done: data.hasVehicle, labelKey: "step_vehicle" as const, href: "/garage" },
    { done: data.hasDocument, labelKey: "step_receipt" as const, href: "/costs" },
    { done: data.hasHomeLocation, labelKey: "step_home" as const, href: "/settings#home-location" },
    { done: false, labelKey: "step_explore" as const, href: "/garage" },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  }

  if (!visible || allDone) return null;

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <GlassCard animate={false} className="relative p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("title")}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("progress", { done: doneCount, total: steps.length })}
          </span>
        </div>

        <ul className="space-y-2">
          {steps.map((step) => (
            <Step
              key={step.labelKey}
              done={step.done}
              label={t(step.labelKey)}
              href={step.href}
            />
          ))}
        </ul>

        <button
          onClick={dismiss}
          className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("dismiss")}
        </button>
      </GlassCard>
    </motion.div>
  );
}

function Step({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {done ? (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
      ) : (
        <Circle className="size-4 shrink-0 text-muted-foreground" />
      )}
      {done ? (
        <span className="text-muted-foreground line-through">{label}</span>
      ) : (
        <Link
          href={href}
          className="flex items-center gap-0.5 hover:text-foreground underline underline-offset-2"
        >
          {label}
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </li>
  );
}
