"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BatteryCharging, Car, LayoutGrid, Settings, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/garage",    label: "Garage",    icon: LayoutGrid },
  { href: "/dashboard", label: "Dashboard", icon: Car },
  { href: "/charging",  label: "Charging",  icon: BatteryCharging },
  { href: "/energy",    label: "Energy",    icon: Zap },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="size-4" />
        </div>
        <div className="font-semibold tracking-tight">Flux</div>
        <div className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          DAO Lab
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((it) => {
          const Icon = it.icon;
          const active =
            pathname === it.href || pathname?.startsWith(`${it.href}/`);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 text-xs text-muted-foreground">
        Open portfolio · v0.1.0
      </div>
    </aside>
  );
}
