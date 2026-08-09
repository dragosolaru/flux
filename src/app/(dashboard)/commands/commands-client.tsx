"use client";

import Link from "next/link";
import { Car } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { AllCommands } from "@/components/vehicle/AllCommands";
import { CommandPanel } from "@/components/vehicle/CommandPanel";
import { CommandHistory } from "@/components/vehicle/CommandHistory";
import { FeatureGate } from "@/components/layout/FeatureGate";
import { useVehicle } from "@/hooks/useVehicle";
import { cardVariants, staggerContainer } from "@/lib/animations/variants";
import { PageHeader, Card, SectionHeader, EmptyState } from "@/components/ui-kit";
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
      <div className="px-4 pb-6">
        <EmptyState
          icon={Car}
          title={t("no_vehicles_title")}
          hint={t("no_vehicles_hint")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/garage">{tGarage("add_vehicle")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <FeatureGate capability="COMMANDS">
      <div className="px-4 pb-6 space-y-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
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
      </div>
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
      <SectionHeader title={name} icon={Car} />
      <Card variant="surface" className="p-5 mt-2">
        {/* The quick row stays on top: four taps cover almost every session,
            and burying them in a group of twenty-two would be a downgrade. */}
        <CommandPanel vehicleId={id} brand={brand} state={data} />

        <div className="mt-6">
          <AllCommands vehicleId={id} brand={brand} state={data} />
        </div>

        {/* The audit trail sits with the controls that write it, so an unlock
            nobody recognises is visible where it would be acted on. */}
        <div className="mt-6">
          <CommandHistory vehicleId={id} />
        </div>
      </Card>
    </motion.div>
  );
}
