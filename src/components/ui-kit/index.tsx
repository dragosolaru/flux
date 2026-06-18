"use client";

// =============================================================================
// Flux UI kit — the shared, theme-aware building blocks every dashboard screen
// composes from. One vocabulary → a coherent, modern mobile app. All surfaces
// use design tokens (bg-card / bg-muted / border-border / *-foreground) so they
// render correctly in BOTH light and dark themes.
// =============================================================================

import { motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Re-export the map vocabulary so screens import everything from one place.
export { SegmentedControl, StatStrip, type Stat, type SegOption } from "@/components/map/map-ui";

// ── Tap feedback spring (standard across the app) ───────────────────────────
export const TAP = { type: "spring" as const, stiffness: 500, damping: 30 };

// ── PageHeader ──────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

// ── SectionHeader ───────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  icon: Icon,
  trailing,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {title}
      </div>
      {trailing}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

type CardVariant = "glass" | "surface" | "muted";

const CARD_VARIANTS: Record<CardVariant, string> = {
  // Floating / map overlays — translucent + blur.
  glass: "border border-border bg-card/80 backdrop-blur-xl",
  // Default static surface.
  surface: "border border-border bg-card",
  // Subtle inset fill (rows, nested blocks).
  muted: "border border-border bg-muted/40",
};

export function Card({
  children,
  variant = "surface",
  className,
}: {
  children: ReactNode;
  variant?: CardVariant;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl", CARD_VARIANTS[variant], className)}>{children}</div>
  );
}

// ── StatTile ────────────────────────────────────────────────────────────────

export function StatTile({
  value,
  label,
  icon: Icon,
  accent,
  className,
}: {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Tailwind text color class for the value, e.g. "text-chart-2". */
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border border-border bg-card px-3 py-3 text-center",
        className,
      )}
    >
      {Icon && <Icon className="mb-0.5 size-4 text-muted-foreground" />}
      <motion.span
        key={value}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn("text-lg font-thin leading-none tabular-nums", accent)}
      >
        {value}
      </motion.span>
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

// ── ListRow ─────────────────────────────────────────────────────────────────

export function ListRow({
  leading,
  title,
  meta,
  trailing,
  onClick,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const base = cn(
    "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors",
    onClick && "hover:bg-muted active:bg-muted",
    className,
  );

  const inner = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
    </>
  );

  if (!onClick) return <div className={base}>{inner}</div>;

  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.98 }} transition={TAP} className={base}>
      {inner}
    </motion.button>
  );
}

// ── Chip ────────────────────────────────────────────────────────────────────

export function Chip({
  label,
  active = false,
  icon: Icon,
  onClick,
}: {
  label: string;
  active?: boolean;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={TAP}
      aria-pressed={active}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
        active
          ? "border-primary/50 bg-primary/15 font-semibold text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {label}
    </motion.button>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon className="size-12 text-muted-foreground/30" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
