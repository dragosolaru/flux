"use client";

import { Fan, Lock, Loader2, Megaphone, Sparkles, Unlock } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { staggerContainer, cardVariants } from "@/lib/animations/variants";
import type { CommandName } from "@/types/history";
import type { VehicleBrand, VehicleState } from "@/types/vehicle";

interface CommandPanelProps {
  vehicleId: string;
  brand: VehicleBrand;
  state: VehicleState | undefined;
}

export function CommandPanel({ vehicleId, brand, state }: CommandPanelProps) {
  const t = useTranslations("commands");
  const caps = useBrandCapabilities(brand);
  const { mutate, isPending, variables } = useVehicleCommand();

  function send(command: CommandName, args?: Record<string, unknown>) {
    mutate(
      { vehicleId, command, args },
      {
        onSuccess: () => toast.success(t("success")),
        onError: () => toast.error(t("error")),
      },
    );
  }

  const inFlight = (cmd: CommandName) =>
    isPending && variables?.command === cmd;

  // While state is loading we default the toggles to the "safer" action:
  // climate off (no battery drain), lock (vehicle secured). This avoids
  // surfacing "Unlock" as the default button before data arrives.
  const climateActive = state?.isClimateOn ?? false;
  const climateCmd: CommandName = climateActive ? "climate_off" : "climate_on";
  const lockCmd: CommandName = state?.isLocked === false ? "lock" : "unlock";
  const stateLoaded = state != null;

  // Compute translated labels at component level (not inside callbacks/conditions)
  const labelLock = t("lock");
  const labelUnlock = t("unlock");
  const labelClimateOn = t("climate_on");
  const labelClimateOff = t("climate_off");
  const labelHonk = t("honk");
  const labelFlash = t("flash");

  const buttons = [
    caps.commands.lock &&
      caps.commands.unlock && {
        cmd: stateLoaded ? lockCmd : ("lock" as CommandName),
        label: stateLoaded
          ? lockCmd === "lock"
            ? labelLock
            : labelUnlock
          : labelLock,
        icon: stateLoaded ? (lockCmd === "lock" ? Lock : Unlock) : Lock,
        inFlight: inFlight("lock") || inFlight("unlock"),
        active: stateLoaded && state?.isLocked === false,
      },
    caps.commands.climateOn &&
      caps.commands.climateOff && {
        cmd: climateCmd,
        label: climateActive ? labelClimateOff : labelClimateOn,
        icon: Fan,
        inFlight: inFlight("climate_on") || inFlight("climate_off"),
        active: climateActive,
      },
    caps.commands.honk && {
      cmd: "honk" as CommandName,
      label: labelHonk,
      icon: Megaphone,
      inFlight: inFlight("honk"),
      active: false,
    },
    caps.commands.flash && {
      cmd: "flash" as CommandName,
      label: labelFlash,
      icon: Sparkles,
      inFlight: inFlight("flash"),
      active: false,
    },
  ].filter(Boolean) as {
    cmd: CommandName;
    label: string;
    icon: ComponentType<{ className?: string }>;
    inFlight: boolean;
    active: boolean;
  }[];

  if (buttons.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {t("no_commands")}
      </p>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 gap-3"
    >
      {buttons.map(({ cmd, label, icon: Icon, inFlight: fly, active }) => {
        const isSending = fly;
        return (
          <motion.div key={cmd} variants={cardVariants}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => send(cmd)}
              disabled={isPending || !state}
              className={[
                "flex min-h-[80px] w-full flex-col items-center justify-center gap-2 rounded-2xl border p-3 transition-all",
                "glass-card",
                active
                  ? "border-primary/60 shadow-lg shadow-primary/20"
                  : "border-white/8",
                isSending
                  ? "pointer-events-none opacity-60"
                  : "hover:border-white/15 hover:bg-white/8",
                !state && "cursor-not-allowed opacity-50",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isSending ? (
                <Loader2 className="size-8 animate-spin text-primary" />
              ) : (
                <Icon
                  className={`size-8 ${active ? "text-primary" : "text-foreground"}`}
                />
              )}
              <span
                className={`text-sm font-medium ${active ? "text-primary" : "text-foreground"}`}
              >
                {label}
              </span>
              {isSending && (
                <span className="text-[10px] text-muted-foreground">
                  {t("sending")}
                </span>
              )}
            </motion.button>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
