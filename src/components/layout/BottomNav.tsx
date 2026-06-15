"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BatteryCharging, Car, Map, MoreHorizontal } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState, useCallback, type ComponentType } from "react";

import { useCapabilities } from "@/hooks/useCapabilities";
import { checkCapability, type Capability } from "@/lib/capabilities";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { cn } from "@/lib/utils";

import { SlideUpMenu } from "./SlideUpMenu";

function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

interface MobileTab {
  key: string;
  href: string | null;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  capability: Capability;
}

const TABS: MobileTab[] = [
  { key: "car",      href: "/dashboard", labelKey: "nav.mobile.car",      icon: Car,             capability: "VEHICLE" },
  { key: "map",      href: "/map",       labelKey: "nav.mobile.map",      icon: Map,             capability: "NONE"    },
  { key: "charging", href: "/charging",  labelKey: "nav.mobile.charging", icon: BatteryCharging, capability: "VEHICLE" },
  { key: "more",     href: null,         labelKey: "nav.mobile.more",     icon: MoreHorizontal,  capability: "NONE"    },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const { data: caps } = useCapabilities();
  const [moreOpen, setMoreOpen] = useState(false);
  const scrollDir = useScrollDirection();
  const reduceMotion = useReducedMotion();

  const hidden = scrollDir === "down" && !moreOpen;

  const activeKey = (() => {
    if (moreOpen) return "more";
    const match = TABS.find(
      (tab) => tab.href !== null && (pathname === tab.href || pathname?.startsWith(`${tab.href}/`)),
    );
    return match?.key ?? null;
  })();

  const handleTabPress = useCallback(
    (tab: MobileTab) => {
      haptic();
      if (tab.key === "more") {
        setMoreOpen((v) => !v);
        return;
      }
      if (!tab.href) return;
      setMoreOpen(false);
      if (pathname === tab.href || pathname?.startsWith(`${tab.href}/`)) {
        (document.querySelector("main") ?? window).scrollTo({ top: 0, behavior: "smooth" });
      } else {
        router.push(tab.href);
      }
    },
    [pathname, router],
  );

  return (
    <>
      {/* Floating pill nav */}
      <motion.nav
        aria-label="Primary"
        className="fixed z-50 md:hidden flex items-center gap-1 rounded-full border border-white/[0.08] p-1 shadow-2xl"
        style={{
          bottom: "calc(14px + env(safe-area-inset-bottom))",
          left: "50%",
          translateX: "-50%",
          background: "oklch(0.13 0.02 265 / 0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          minWidth: 240,
          maxWidth: 300,
        }}
        animate={{ y: reduceMotion ? 0 : hidden ? 90 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeKey === tab.key;
          const gate = caps ? checkCapability(tab.capability, caps) : { ok: true as const };
          const needsUnlock = !gate.ok;

          const buttonClass = cn(
            "relative flex flex-1 flex-col items-center justify-center rounded-full py-2 transition-colors",
            isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
          );

          const inner = (
            <>
              <Icon
                className={cn(
                  "size-[18px] transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground/60",
                )}
              />
              <AnimatePresence>
                {isActive && (
                  <motion.span
                    key="label"
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    className="overflow-hidden text-[11px] text-primary leading-none mt-0.5"
                  >
                    {t(tab.labelKey)}
                  </motion.span>
                )}
              </AnimatePresence>
              {needsUnlock && (
                <span aria-hidden className="absolute right-2 top-1 text-[9px] text-muted-foreground/70">
                  ✦
                </span>
              )}
            </>
          );

          if (tab.href !== null) {
            return (
              <motion.div
                key={tab.key}
                className="flex flex-1"
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <Link
                  href={tab.href}
                  onClick={() => handleTabPress(tab)}
                  aria-label={t(tab.labelKey)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(buttonClass, "w-full")}
                  style={{ minWidth: 56, height: 44 }}
                >
                  {inner}
                </Link>
              </motion.div>
            );
          }

          return (
            <motion.button
              key={tab.key}
              type="button"
              onClick={() => handleTabPress(tab)}
              aria-label={t(tab.labelKey)}
              aria-expanded={tab.key === "more" ? moreOpen : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(buttonClass, "flex-1")}
              style={{ minWidth: 56, height: 44 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              {inner}
            </motion.button>
          );
        })}
      </motion.nav>

      <SlideUpMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
