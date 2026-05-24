"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, Info, MapPin, Route, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ComponentType } from "react";

import { useCapabilities } from "@/hooks/useCapabilities";
import { checkCapability, type Capability } from "@/lib/capabilities";
import { slideUp } from "@/lib/animations/variants";
import { cn } from "@/lib/utils";

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
  { href: "/commands",     labelKey: "nav.commands",    icon: Gamepad2, capability: "COMMANDS" },
  { href: "/charging-map", labelKey: "nav.charging_map", icon: MapPin,   capability: "NONE" },
  { href: "/trip",         labelKey: "nav.trip",        icon: Route,    capability: "VEHICLE" },
  { href: "/settings",     labelKey: "nav.settings",    icon: Settings, capability: "NONE" },
  { href: "/about-data",   labelKey: "nav.about",       icon: Info,     capability: "NONE" },
];

export function SlideUpMenu({ open, onClose }: SlideUpMenuProps) {
  const t = useTranslations();
  const { data: caps } = useCapabilities();

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

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
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
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
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t bg-background pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl md:hidden"
          >
            <div className="flex justify-center pt-2">
              <div className="h-1 w-12 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <h2 className="text-base font-semibold tracking-tight">{t("nav.more")}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>

            <ul className="space-y-1 px-3 pb-4">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const gate = caps ? checkCapability(item.capability, caps) : { ok: true as const };
                const needsUnlock = !gate.ok;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition-colors",
                        "text-foreground hover:bg-accent active:bg-accent/70",
                      )}
                    >
                      <Icon className="size-5 text-muted-foreground" />
                      <span className="flex-1">{t(item.labelKey)}</span>
                      {needsUnlock && (
                        <span aria-hidden className="text-xs text-muted-foreground/70">
                          ✦
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
