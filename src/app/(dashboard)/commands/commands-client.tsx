"use client";

import { motion } from "framer-motion";

import { CommandPanel } from "@/components/vehicle/CommandPanel";
import { FeatureGate } from "@/components/layout/FeatureGate";
import { useVehicle } from "@/hooks/useVehicle";
import { cardVariants, pageVariants, staggerContainer } from "@/lib/animations/variants";
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
  return (
    <FeatureGate capability="COMMANDS">
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {vehicles.map((v) => (
            <VehicleCommands key={v.id} id={v.id} name={v.display_name} brand={v.brand as VehicleBrand} />
          ))}
        </motion.div>
      </motion.div>
    </FeatureGate>
  );
}

function VehicleCommands({ id, name, brand }: { id: string; name: string; brand: VehicleBrand }) {
  const { data } = useVehicle(id);
  return (
    <motion.div variants={cardVariants} className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground">{name}</div>
      <CommandPanel vehicleId={id} brand={brand} state={data} />
    </motion.div>
  );
}
