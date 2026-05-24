"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BatteryCharging, Car, MoreHorizontal, Receipt, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState, type ComponentType } from "react";

import { useCapabilities } from "@/hooks/useCapabilities";
import { checkCapability, type Capability } from "@/lib/capabilities";
import { navIndicatorSpring } from "@/lib/animations/variants";
import { cn } from "@/lib/utils";

import { SlideUpMenu } from "./SlideUpMenu";

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
  { key: "costs",    href: "/costs",     labelKey: "nav.mobile.costs",    icon: Receipt,         capability: "VEHICLE" },
  { key: "energy",   href: "/energy",    labelKey: "nav.mobile.energy",   icon: Zap,             capability: "TARIFF" },
  { key: "more",     href: "__more__",   labelKey: "nav.mobile.more",     icon: MoreHorizontal,  capability: "NONE" },
];

export function BottomNav() {
  const pathname = usePathname();
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

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
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
                    className="absolute -top-px h-0.5 w-8 rounded-full bg-primary"
                    transition={navIndicatorSpring}
                  />
                )}
                <Icon
                  className={cn(
                    "size-5 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "transition-colors",
                    isActive ? "text-foreground font-medium" : "text-muted-foreground",
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
                {tab.href === "__more__" ? (
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    aria-label={t(tab.labelKey)}
                    aria-expanded={moreOpen}
                    className="w-full active:opacity-70"
                  >
                    {content}
                  </button>
                ) : (
                  <Link href={tab.href} className="block active:opacity-70">
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <SlideUpMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
