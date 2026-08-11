"use client";

import { Fan, Lock, Loader2, Megaphone, Sparkles, Unlock } from "lucide-react";
import { useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmCommandDialog, SENSITIVE_COMMANDS } from "@/components/vehicle/ConfirmCommandDialog";
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
  const { mutate, isPending, variables, isError, error } = useVehicleCommand();
  const MAPPED = [
    "error_rate_limit",
    "error_vcp_required",
    "error_proxy_missing",
    "error_not_supported",
  ];
  const errorText = isError
    ? t(error && MAPPED.includes(error.message) ? error.message : "error")
    : null;

  const [confirming, setConfirming] = useState<CommandName | null>(null);

  function send(command: CommandName, args?: Record<string, unknown>) {
    // Toasts + optimistic update are handled centrally in useVehicleCommand;
    // passing per-call onSuccess/onError here would double-fire the toast.
    mutate({ vehicleId, command, args });
  }

  function request(command: CommandName) {
    if (SENSITIVE_COMMANDS.has(command)) {
      setConfirming(command);
      return;
    }
    send(command);
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

  // State still loading — show a skeleton row instead of greyed-out buttons
  // that look broken/frozen on first load.
  if (!state) {
    return (
      <div className="flex gap-3">
        {buttons.map((_, i) => (
          <Skeleton key={i} className="size-11 rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
    <ConfirmCommandDialog
      command={confirming}
      onConfirm={() => {
        const cmd = confirming;
        setConfirming(null);
        if (cmd) send(cmd);
      }}
      onCancel={() => setConfirming(null)}
    />
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex gap-3"
    >
      {buttons.map(({ cmd, label, icon: Icon, inFlight: fly, active }) => {
        const isSending = fly;
        return (
          <motion.div key={cmd} variants={cardVariants}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => request(cmd)}
              disabled={isSending}
              title={label}
              aria-label={label}
              className={[
                "size-11 rounded-full flex items-center justify-center transition-all",
                "bg-muted/60 backdrop-blur-sm border border-border",
                active
                  ? "border-primary/60 bg-primary/15 shadow-lg shadow-primary/20"
                  : "",
                isSending
                  ? "pointer-events-none opacity-60"
                  : "hover:border-border hover:bg-muted",
                !state && "cursor-not-allowed opacity-50",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isSending ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <Icon
                  className={`size-4 ${active ? "text-primary" : "text-muted-foreground"}`}
                />
              )}
            </motion.button>
          </motion.div>
        );
      })}
    </motion.div>
      {errorText && (
        <p role="alert" className="text-xs text-destructive">
          {errorText}
        </p>
      )}
    </div>
  );
}
