"use client";

// Shared visual vocabulary for the /map and /trip screens. Keeps the desktop
// sidebar and the mobile bottom sheet visually identical, and centralises the
// segmented control + stat strip so both screens animate the same way.

import { motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Class strings (copy-paste consistent across both screens) ───────────────

export const SECTION_TITLE =
  "text-2xs font-semibold uppercase tracking-wide text-muted-foreground";

export const LIST_ROW =
  "group flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted active:bg-muted";

export const PILL_BASE = "h-9 shrink-0 rounded-full border px-3 text-xs transition-colors";
export const PILL_ON = "border-primary/50 bg-primary/15 font-semibold text-foreground";
export const PILL_OFF =
  "border-border bg-card text-muted-foreground hover:bg-muted";

// ── Segmented control ───────────────────────────────────────────────────────

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

interface SegmentedControlProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Unique per mounted instance — avoids the shared-thumb jump between the
   *  mobile sheet and the desktop sidebar. */
  layoutId: string;
  className?: string;
  /** Slimmer tabs for tight mobile surfaces (h-8 instead of h-9). */
  dense?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  className,
  dense,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn("relative flex rounded-[10px] bg-muted/40 p-0.5", className)}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
              dense ? "h-8 text-xs" : "h-9 text-[13px]",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-lg bg-muted shadow-sm ring-1 ring-border"
              />
            )}
            {Icon && <Icon className="size-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Stat strip ──────────────────────────────────────────────────────────────

export interface Stat {
  value: string;
  label: string;
  /** When true the value renders in the cost/success accent colour. */
  accent?: boolean;
}

export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-stretch divide-x divide-border overflow-hidden rounded-xl bg-muted/40",
        className,
      )}
    >
      {stats.map((s, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-center px-2 py-2">
          <motion.span
            key={s.value}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "text-sm font-semibold tabular-nums",
              s.accent ? "text-green-400" : "text-foreground",
            )}
          >
            {s.value}
          </motion.span>
          <span className="mt-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Sidebar shell (desktop) ─────────────────────────────────────────────────

export function DesktopSidebar({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <aside className="absolute left-0 top-0 z-[1000] hidden h-full w-[380px] flex-col border-r border-border bg-[var(--sidebar)]/95 shadow-2xl backdrop-blur-2xl lg:flex xl:w-[400px]">
      <div className="shrink-0 px-5 pb-3 pt-5">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <Icon className="size-4 text-primary" />
          {title}
        </div>
      </div>
      {children}
    </aside>
  );
}
