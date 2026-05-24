"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Car, KeyRound, Lightbulb, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { floatLoop } from "@/lib/animations/variants";
import type { Capability } from "@/lib/capabilities";

interface CapabilityEmptyStateProps {
  missing: Exclude<Capability, "NONE">;
  ctaHref: string;
}

const ICONS: Record<Exclude<Capability, "NONE">, ComponentType<{ className?: string }>> = {
  VEHICLE: Car,
  LIVE: Zap,
  TARIFF: Lightbulb,
  COMMANDS: KeyRound,
};

const TITLE_KEYS: Record<Exclude<Capability, "NONE">, string> = {
  VEHICLE: "empty_states.no_vehicle.title",
  LIVE: "empty_states.no_live.title",
  TARIFF: "empty_states.no_tariff.title",
  COMMANDS: "empty_states.no_commands.title",
};

const SUBTITLE_KEYS: Record<Exclude<Capability, "NONE">, string> = {
  VEHICLE: "empty_states.no_vehicle.subtitle",
  LIVE: "empty_states.no_live.subtitle",
  TARIFF: "empty_states.no_tariff.subtitle",
  COMMANDS: "empty_states.no_commands.subtitle",
};

const CTA_KEYS: Record<Exclude<Capability, "NONE">, string> = {
  VEHICLE: "empty_states.no_vehicle.cta",
  LIVE: "empty_states.no_live.cta",
  TARIFF: "empty_states.no_tariff.cta",
  COMMANDS: "empty_states.no_commands.cta",
};

export function CapabilityEmptyState({ missing, ctaHref }: CapabilityEmptyStateProps) {
  const t = useTranslations();
  const Icon = ICONS[missing];

  return (
    <Card className="overflow-hidden border-dashed">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-12 text-center sm:py-16">
        <motion.div
          className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-primary"
          animate={floatLoop.animate}
          transition={floatLoop.transition}
        >
          <Icon className="size-8" />
        </motion.div>

        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            {t(TITLE_KEYS[missing])}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(SUBTITLE_KEYS[missing])}
          </p>
        </div>

        <Button asChild size="lg">
          <Link href={ctaHref}>{t(CTA_KEYS[missing])}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
