"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

/**
 * The Instrument primitives. Every /v2 screen is assembled from these and adds
 * nothing — that is the test of the direction. If a screen needs a new
 * component, either the screen is wrong or this file is incomplete.
 *
 * There is no card, no shadow and no rounded panel anywhere in here on purpose.
 * Structure comes from the 8% hairline and the 56px row.
 */

// ---------------------------------------------------------------------------
// Screen shell
// ---------------------------------------------------------------------------

/**
 * dvh, not vh: Safari's collapsing toolbar makes vh lie, which is how a bottom
 * nav ends up under the browser chrome on an iPhone.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ paddingLeft: "var(--v2-gutter)", paddingRight: "var(--v2-gutter)" }}
    >
      {children}
    </div>
  );
}

export function ScreenHeader({ title, meta, metaTone = "muted" }: {
  title: string;
  meta?: string;
  metaTone?: "muted" | "accent" | "amber" | "green";
}) {
  return (
    <div className="v2-rise flex items-baseline justify-between pt-5">
      <span className="min-w-0 truncate text-[15px] font-medium tracking-[-0.01em]">{title}</span>
      {meta && <Mono className={`ml-3 shrink-0 ${toneClass(metaTone)}`}>{meta}</Mono>}
    </div>
  );
}

function toneClass(tone: "muted" | "accent" | "amber" | "green" | "red"): string {
  if (tone === "accent") return "text-primary";
  if (tone === "amber") return "text-chart-3";
  if (tone === "green") return "text-chart-2";
  if (tone === "red") return "text-destructive";
  return "text-muted-foreground";
}

/** Fills the space between the content above it and the rows below. */
export function Spacer() {
  return <div className="flex-1" />;
}

/** The uppercase mono voice: labels, states, units. Never body copy. */
export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums ${className}`}
      style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
    >
      {children}
    </span>
  );
}

/** A section marker. Smaller and dimmer than Mono — it is a label for a group. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="font-mono text-[9px] uppercase tracking-[0.2em]"
      style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", color: "var(--v2-faint)" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row — the single interactive element in the whole system
// ---------------------------------------------------------------------------

/**
 * The waiting state: an amber label that counts.
 *
 * A spinner says something is happening; after five seconds the question is how
 * long it has been, and only a counter answers that. Tesla commands routinely
 * take 4–10s against a sleeping car, so this is the normal case.
 *
 * It is rendered conditionally rather than reset, so every command mounts a
 * fresh one starting at zero — the count can never be left over from the last.
 */
function PendingCounter({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <Mono className="text-chart-3">{`${label} ${seconds}s`}</Mono>;
}

export interface RowProps {
  icon?: ReactNode;
  label: ReactNode;
  /** Right-hand state. A row must never hide what it currently is. */
  value?: ReactNode;
  valueTone?: "muted" | "accent" | "amber" | "green" | "red";
  /** Shown instead of `value` while a command is in flight, with its counter. */
  pending?: boolean;
  /** Verb only — the counter appends the seconds. */
  pendingLabel?: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /**
   * Why it is disabled. A greyed row with no reason is a shrug; this prints
   * beside the label so the refusal answers the question it raises.
   */
  reason?: string;
  /** Closes the group. Rows share the hairline above; the last one needs one below. */
  last?: boolean;
}

export function Row({
  icon,
  label,
  value,
  valueTone = "muted",
  pending,
  pendingLabel,
  onClick,
  href,
  disabled,
  reason,
  last,
}: RowProps) {
  const interactive = (onClick || href) && !disabled;

  const body = (
    <>
      {icon !== undefined && (
        <span className="flex size-[19px] shrink-0 items-center justify-center [&>svg]:size-[19px]">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-left text-base">{label}</span>
      {pending ? (
        <PendingCounter label={pendingLabel ?? "…"} />
      ) : reason && disabled ? (
        <Mono className="text-muted-foreground">{reason}</Mono>
      ) : typeof value === "string" ? (
        <Mono className={toneClass(valueTone)}>{value}</Mono>
      ) : (
        value
      )}
    </>
  );

  // 80ms to 5% white. No scale and no ripple — a 56px row that shrinks under
  // the thumb is a card pretending to be a button.
  const className = [
    "flex w-full items-center gap-3.5 border-t border-border text-foreground",
    "transition-colors duration-[80ms]",
    last ? "border-b" : "",
    disabled ? "opacity-45" : "",
    interactive ? "active:bg-white/5" : "",
  ].join(" ");

  const style = { minHeight: "var(--v2-row)" };

  if (href && !disabled) {
    return (
      <Link href={href} className={className} style={style}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={className} style={style}>
        {body}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

/** A group of rows. Only exists to close the last hairline. */
export function Rows({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

// ---------------------------------------------------------------------------
// The arc — allowed exactly where a number IS a level
// ---------------------------------------------------------------------------

const R = 110;
const CIRC = 2 * Math.PI * R; // 691.15
const SWEEP = CIRC * 0.75; // 270° of it

export function Arc({
  value,
  limit,
  color = "var(--chart-3)",
  children,
  animate = true,
}: {
  /** 0–100. Clamped: a bad reading must not draw a wrong picture. */
  value: number;
  /** Charge limit tick, 0–100. */
  limit?: number | null;
  color?: string;
  children?: ReactNode;
  animate?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const filled = (SWEEP * pct) / 100;

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: "var(--v2-arc)", height: "var(--v2-arc)" }}
    >
      <svg viewBox="0 0 300 300" className="size-full" aria-hidden>
        <circle
          cx="150" cy="150" r={R} fill="none"
          stroke="oklch(0.97 0 0 / 8%)" strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray={`${SWEEP} ${CIRC - SWEEP}`}
          transform="rotate(135 150 150)"
        />
        <circle
          cx="150" cy="150" r={R} fill="none"
          stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRC - filled}`}
          transform="rotate(135 150 150)"
          className={animate ? "v2-sweep" : undefined}
        />
        {limit != null && limit > 0 && limit <= 100 && (
          <circle
            cx="150" cy="150" r={R} fill="none"
            stroke="oklch(0.97 0 0 / 45%)" strokeWidth="10"
            strokeDasharray={`2 ${CIRC - 2}`}
            strokeDashoffset={-(SWEEP * limit) / 100}
            transform="rotate(135 150 150)"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        {children}
      </div>
    </div>
  );
}

/**
 * The hero reading inside the arc. Tabular so a change never shifts the layout,
 * and crossfaded via `key` so the digits are legible at every frame — someone
 * is reading this while walking.
 */
export function HeroValue({ value, unit, sub }: { value: string; unit?: string; sub?: string }) {
  return (
    <>
      <div className="flex items-start gap-[3px]">
        <span
          key={value}
          className="font-light leading-[0.9] tracking-[-0.045em] tabular-nums"
          style={{ fontSize: "var(--v2-hero)" }}
        >
          {value}
        </span>
        {unit && (
          <span className="mt-2 text-xl font-normal" style={{ color: "var(--v2-soft)" }}>
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <Mono className="text-[13px] tracking-[0.04em] normal-case" >
          <span style={{ color: "var(--v2-soft)" }}>{sub}</span>
        </Mono>
      )}
    </>
  );
}

/** The miniature arc: same object at 46px, as a row ornament. */
export function ArcMini({ value, color = "var(--chart-3)" }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const filled = (SWEEP * pct) / 100;
  return (
    <svg width="46" height="46" viewBox="0 0 300 300" className="shrink-0" aria-hidden>
      <circle
        cx="150" cy="150" r={R} fill="none"
        stroke="oklch(0.97 0 0 / 10%)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${SWEEP} ${CIRC - SWEEP}`} transform="rotate(135 150 150)"
      />
      <circle
        cx="150" cy="150" r={R} fill="none"
        stroke={color} strokeWidth="20" strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRC - filled}`} transform="rotate(135 150 150)"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Three-value table
// ---------------------------------------------------------------------------

export function ValueTable({
  items,
}: {
  items: { key: string; label: string; value: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="grid border-t border-border"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          className={`py-3.5 ${i > 0 ? "pl-4" : ""} ${i < items.length - 1 ? "border-r border-border" : ""}`}
        >
          <div
            className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground"
            style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
          >
            {item.label}
          </div>
          <div className="mt-0.5 truncate text-[21px] font-light tabular-nums">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
