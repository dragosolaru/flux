"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Car,
  ChevronDown,
  FileText,
  Info,
  LayoutGrid,
  Receipt,
  Route,
  Settings,
  Zap,
} from "lucide-react";
import { FluxLogo } from "@/components/ui/FluxLogo";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { checkCapability, type Capability } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  capability: Capability;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

// Grouped by what someone is doing, not by which subsystem owns the screen.
//
// Two changes worth recording. Documents moved out of "the car" and next to
// Costs, because a document IS a cost here — the OCR pipeline exists to turn
// bills into the monthly figure, and separating them made the paid product read
// as two unrelated features. And the station map is gone from this list
// entirely: it is the `explore` tab on /map, so having both meant two entries
// pointing at the same thing.
const SECTIONS: NavSection[] = [
  {
    titleKey: "nav.section.car",
    items: [
      { href: "/garage",    labelKey: "garage.title",  icon: LayoutGrid, capability: "NONE" },
      { href: "/dashboard", labelKey: "nav.dashboard", icon: Car,        capability: "VEHICLE" },
      { href: "/insights",  labelKey: "nav.insights",  icon: BarChart3,  capability: "VEHICLE" },
    ],
  },
  {
    titleKey: "nav.section.money",
    items: [
      { href: "/costs",     labelKey: "nav.costs",     icon: Receipt,  capability: "VEHICLE" },
      { href: "/documents", labelKey: "nav.documents", icon: FileText, capability: "VEHICLE" },
      { href: "/energy",    labelKey: "nav.energy",    icon: Zap,      capability: "TARIFF" },
    ],
  },
  {
    titleKey: "nav.section.planning",
    items: [
      { href: "/map", labelKey: "nav.map", icon: Route, capability: "NONE" },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
  { href: "/settings",   labelKey: "nav.settings", icon: Settings, capability: "NONE" },
  { href: "/about-data", labelKey: "nav.about",    icon: Info,     capability: "NONE" },
];

function tooltipKeyFor(missing: Capability): string {
  switch (missing) {
    case "VEHICLE": return "nav.indicator.tooltip.vehicle";
    case "TARIFF":  return "nav.indicator.tooltip.tariff";
    default: return "";
  }
}

function SidebarVehicleSwitcher() {
  const { data: vehicles } = useVehicles();
  const { selectedVehicleId, setSelectedVehicleId } = useVehicleContext();

  if (!vehicles || vehicles.length === 0) return null;

  if (vehicles.length === 1) {
    return (
      <div className="flex items-center gap-2 border-b px-5 py-2.5">
        <Car className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{vehicles[0].nickname ?? vehicles[0].displayName}</span>
      </div>
    );
  }

  return (
    <div className="border-b px-3 py-2">
      <div className="relative">
        <Car className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <select
          value={selectedVehicleId ?? ""}
          onChange={(e) => { if (e.target.value) setSelectedVehicleId(e.target.value); }}
          className="w-full cursor-pointer appearance-none rounded-lg border-0 bg-muted/40 py-1.5 pl-8 pr-6 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.nickname ?? v.displayName}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations();
  const { data: caps } = useCapabilities();

  function renderItem(item: NavItem) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
    const gate = caps ? checkCapability(item.capability, caps) : { ok: true as const };
    const needsUnlock = !gate.ok;

    const link = (
      <Link
        href={item.href}
        className={cn(
          "group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4" />
        <span className="flex-1">{t(item.labelKey)}</span>
        {needsUnlock && (
          <span aria-hidden className="text-xs text-muted-foreground/70 transition-opacity group-hover:text-foreground">
            ✦
          </span>
        )}
      </Link>
    );

    if (!needsUnlock) {
      return <div key={item.href}>{link}</div>;
    }

    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{t(tooltipKeyFor(gate.missing))}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <FluxLogo size={20} />
          <div className="font-semibold tracking-tight">Flux</div>
          <div className="ml-auto text-xs uppercase tracking-wider text-muted-foreground">
            DAO Lab
          </div>
        </div>

        <SidebarVehicleSwitcher />

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {SECTIONS.map((section) => (
            <div key={section.titleKey} className="space-y-1">
              <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                {t(section.titleKey)}
              </div>
              {section.items.map(renderItem)}
            </div>
          ))}

          <div className="space-y-1 border-t pt-4">
            {FOOTER_ITEMS.map(renderItem)}
          </div>
        </nav>

        <div className="border-t p-3 text-xs text-muted-foreground">
          Open portfolio · v0.1.0
        </div>
      </aside>
    </TooltipProvider>
  );
}
