"use client";

import { usePathname, useRouter } from "next/navigation";
import { BatteryCharging, Car, MoreHorizontal, Route } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState, useCallback, type ComponentType } from "react";

import { useCapabilities } from "@/hooks/useCapabilities";
import { checkCapability, type Capability } from "@/lib/capabilities";
import { navIndicatorSpring } from "@/lib/animations/variants";
import { cn } from "@/lib/utils";

import { SlideUpMenu } from "./SlideUpMenu";

function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

interface MobileTab {
  key: string;
  href: string | "__more__";
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  capability: Capability;
}

const TABS: MobileTab[] = [
  { key: "car",      href: "/dashboard", labelKey: "nav.mobile.car",      icon: Car,             capability: "VEHICLE" },
  { key: "charging", href: "/charging",  labelKey: "nav.mobile.charging", icon: BatteryCharging, capability: "VEHICLE" },
  { key: "trip",     href: "/trip",      labelKey: "nav.mobile.trip",     icon: Route,           capability: "VEHICLE" },
  { key: "more",     href: "__more__",   labelKey: "nav.mobile.more",     icon: MoreHorizontal,  capability: "NONE" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const { data: caps } = useCapabilities();
  const [moreOpen, setMoreOpen] = useState(false);

  const activeKey = (() => {
    if (moreOpen) return "more";
    const match = TABS.find(
      (tab) => tab.href !== "__more__" && (pathname === tab.href || pathname?.startsWith(`${tab.href}/`)),
    );
    return match?.key ?? null;
  })();

  const handleTabPress = useCallback(
    (tab: MobileTab) => {
      haptic();
      if (tab.href === "__more__") {
        setMoreOpen(true);
        return;
      }
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
      <nav
        aria-label="Primary"
        className="shrink-0 border-t border-white/8 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden"
      >
        <ul className="grid grid-cols-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeKey === tab.key;
            const gate = caps ? checkCapability(tab.capability, caps) : { ok: true as const };
            const needsUnlock = !gate.ok;

            const content = (
              <div className="relative flex flex-col items-center gap-0.5 py-2 text-[11px]">
                {isActive && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute inset-x-1 inset-y-0.5 rounded-xl bg-primary/15"
                    transition={navIndicatorSpring}
                  />
                )}
                <Icon
                  className={cn(
                    "relative size-[22px] transition-colors",
                    isActive ? "text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "relative transition-colors",
                    isActive ? "text-primary font-semibold" : "text-muted-foreground",
                  )}
                >
                  {t(tab.labelKey)}
                </span>
                {needsUnlock && (
                  <span
                    aria-hidden
                    className="absolute right-3 top-1.5 text-[9px] text-muted-foreground/70"
                  >
                    ✦
                  </span>
                )}
              </div>
            );

            return (
              <li key={tab.key}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  onClick={() => handleTabPress(tab)}
                  aria-label={t(tab.labelKey)}
                  aria-expanded={tab.href === "__more__" ? moreOpen : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className="w-full"
                >
                  {content}
                </motion.button>
              </li>
            );
          })}
        </ul>
      </nav>
      <SlideUpMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
