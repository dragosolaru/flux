"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Car, ChevronDown, FileText, Gamepad2, Info, MapPin, Receipt, Settings, X, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ComponentType } from "react";

import { useCapabilities } from "@/hooks/useCapabilities";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { checkCapability, type Capability } from "@/lib/capabilities";
import { slideUp } from "@/lib/animations/variants";

interface SlideUpMenuProps {
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  href: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  capability: Capability;
}

const MENU_ITEMS: MenuItem[] = [
  { href: "/insights",     labelKey: "nav.insights",     icon: BarChart3, capability: "VEHICLE" },
  { href: "/documents",    labelKey: "nav.documents",    icon: FileText,  capability: "VEHICLE" },
  { href: "/costs",        labelKey: "nav.costs",        icon: Receipt,   capability: "VEHICLE" },
  { href: "/energy",       labelKey: "nav.energy",       icon: Zap,       capability: "TARIFF" },
  { href: "/charging-map", labelKey: "nav.charging_map", icon: MapPin,    capability: "NONE" },
  { href: "/commands",     labelKey: "nav.commands",     icon: Gamepad2,  capability: "COMMANDS" },
  { href: "/settings",     labelKey: "nav.settings",     icon: Settings,  capability: "NONE" },
  { href: "/about-data",   labelKey: "nav.about",        icon: Info,      capability: "NONE" },
];

function MobileVehicleSwitcher({ onClose }: { onClose: () => void }) {
  const { data: vehicles } = useVehicles();
  const { selectedVehicleId, setSelectedVehicleId } = useVehicleContext();

  if (!vehicles || vehicles.length <= 1) return null;

  return (
    <div className="px-3 pb-3">
      <div className="relative">
        <Car className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <select
          value={selectedVehicleId ?? ""}
          onChange={(e) => {
            if (e.target.value) {
              setSelectedVehicleId(e.target.value);
              onClose();
            }
          }}
          className="w-full cursor-pointer appearance-none rounded-xl bg-muted/40 py-3 pl-9 pr-8 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.nickname ?? v.displayName}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

export function SlideUpMenu({ open, onClose }: SlideUpMenuProps) {
  const t = useTranslations();
  const { data: caps } = useCapabilities();

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm md:hidden"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label={t("nav.more")}
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 400) onClose();
            }}
            className="fixed inset-x-0 bottom-0 z-[2001] rounded-t-3xl border-t border-border bg-background/85 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-8px_40px_rgba(0,0,0,0.4)] backdrop-blur-3xl md:hidden"
          >
            <div className="flex justify-center pt-3">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/40" />
            </div>

            <div className="flex justify-end px-3 pt-1 pb-2">
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>

            <MobileVehicleSwitcher onClose={onClose} />

            <div className="grid grid-cols-2 gap-2 px-3 pb-4">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const gate = caps ? checkCapability(item.capability, caps) : { ok: true as const };
                const needsUnlock = !gate.ok;
                return (
                  <motion.div
                    key={item.href}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className="flex items-center gap-2.5 rounded-[10px] bg-muted/40 px-3 py-3"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium">{t(item.labelKey)}</span>
                      {needsUnlock && (
                        <span aria-hidden className="ml-auto text-xs text-muted-foreground/70">
                          ✦
                        </span>
                      )}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
