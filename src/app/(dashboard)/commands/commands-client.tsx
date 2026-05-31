"use client";

import Link from "next/link";
import { Car } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { CommandPanel } from "@/components/vehicle/CommandPanel";
import { FeatureGate } from "@/components/layout/FeatureGate";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { useVehicle } from "@/hooks/useVehicle";
import { cardVariants, staggerContainer } from "@/lib/animations/variants";
import type { VehicleBrand } from "@/types/vehicle";

interface CommandsClientProps {
  vehicles: Array<{
    id: string;
    display_name: string;
    brand: string;
    data_source: "mock" | "live";
    virtual_key_paired: boolean;
  }>;
}

export function CommandsClient({ vehicles }: CommandsClientProps) {
  const t = useTranslations("commands");
  const tGarage = useTranslations("garage");

  if (vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Car className="size-12 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">
          {t("no_vehicles_title")}
        </p>
        <p className="text-xs text-muted-foreground">{t("no_vehicles_hint")}</p>
        <Button asChild variant="outline" size="sm" className="mt-1">
          <Link href="/garage">{tGarage("add_vehicle")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <FeatureGate capability="COMMANDS">
      <PageWrapper>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {vehicles.map((v) => (
            <VehicleCommands
              key={v.id}
              id={v.id}
              name={v.display_name}
              brand={v.brand as VehicleBrand}
            />
          ))}
        </motion.div>
      </PageWrapper>
    </FeatureGate>
  );
}

function VehicleCommands({
  id,
  name,
  brand,
}: {
  id: string;
  name: string;
  brand: VehicleBrand;
}) {
  const { data } = useVehicle(id);

  return (
    <motion.div variants={cardVariants}>
      <GlassCard className="p-5" animate={false}>
        <p className="mb-4 text-sm font-semibold">{name}</p>
        <CommandPanel vehicleId={id} brand={brand} state={data} />
      </GlassCard>
    </motion.div>
  );
}
