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

/**
 * @param title     a string, or the vehicle switcher itself on the one screen
 *                  whose title IS the car.
 * @param switcher  passed by every screen whose data belongs to ONE car, so
 *                  which car is selected is visible and changeable without
 *                  going to the garage first. Passed in rather than imported
 *                  here: the switcher reads the vehicle list, and a primitives
 *                  file that fetches would put a query behind every Row.
 */
export function ScreenHeader({
  title,
  meta,
  metaTone = "muted",
  switcher,
}: {
  title: ReactNode;
  meta?: string;
  metaTone?: "muted" | "accent" | "amber" | "green";
  switcher?: ReactNode;
}) {
  return (
    <div className="v2-rise flex min-h-11 items-center justify-between gap-3 pt-4">
      {typeof title === "string" ? (
        <span className="min-w-0 truncate text-[15px] font-medium tracking-[-0.01em]">{title}</span>
      ) : (
        title
      )}
      <span className="flex min-w-0 shrink-0 items-center gap-3">
        {switcher}
        {meta && <Mono className={toneClass(metaTone)}>{meta}</Mono>}
      </span>
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

/**
 * Cancels the screen gutter for one child — a map or an image that has to touch
 * both edges. The only thing in the system allowed to break the margin.
 */
export function Bleed({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginLeft: "calc(var(--v2-gutter) * -1)", marginRight: "calc(var(--v2-gutter) * -1)" }}>
      {children}
    </div>
  );
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
      // An external destination — a walking route, a charger's directions —
      // opens in a new tab. Installed as a PWA there is no back button, so
      // navigating away in place hands the app's only window to Google Maps.
      href.startsWith("http") ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={className}
          style={style}
        >
          {body}
        </a>
      ) : (
        <Link href={href} className={className} style={style}>
          {body}
        </Link>
      )
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

/**
 * A panel that comes up from the bottom edge.
 *
 * Exists because a selection made at the bottom of the screen — a marker on a
 * map, a row in a list — has to show its result where the finger already is.
 * The charger detail used to render below the list, so tapping a pin on the map
 * put the answer three screens further down and the tap read as doing nothing.
 *
 * Deliberately square-cornered and hairline-topped, like everything else: it is
 * the same surface arriving from a different direction, not a card.
 */
export function Sheet({
  onClose,
  label,
  children,
}: {
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[1200] flex items-end bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80dvh] w-full overflow-y-auto border-t border-border bg-background"
        style={{
          paddingLeft: "var(--v2-gutter)",
          paddingRight: "var(--v2-gutter)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)",
        }}
      >
        {/* A grab handle: this arrives from the bottom edge, and the gesture to
            dismiss it has to be suggested by something. */}
        <div className="flex justify-center py-3">
          <span className="h-1 w-10 rounded-full bg-white/15" />
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings that live inside a row
// ---------------------------------------------------------------------------

/**
 * A setting with a handful of real answers, as tappable values.
 *
 * Not a slider: charge limit had eleven stops across 298px inside a vertically
 * scrolling page, on a control iOS often reads as a scroll gesture. Tapping the
 * value IS the command, so there is no Apply step either.
 */
export function ChipRow({
  label,
  unit,
  values,
  current,
  busy,
  busyLabel,
  onPick,
  format,
  last,
}: {
  label: string;
  unit: string;
  values: number[];
  current: number | null;
  busy?: boolean;
  busyLabel?: string;
  onPick: (value: number) => void;
  /**
   * How a value reads. Needed where a number is a stand-in for a word: a power
   * filter of 0 means "any", and a chip saying "0" claims the opposite — that
   * you are asking for chargers of no power at all.
   */
  format?: (value: number) => string;
  last?: boolean;
}) {
  return (
    <div className={`border-t border-border py-3.5 ${last ? "border-b" : ""}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-base">{label}</span>
        {busy ? (
          <PendingCounter label={busyLabel ?? "…"} />
        ) : (
          <Mono className="text-muted-foreground">
            {current == null ? "—" : format ? format(current) : `${current}${unit}`}
          </Mono>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {values.map((v) => {
          const active = current === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onPick(v)}
              disabled={busy}
              className={[
                "min-h-11 min-w-11 px-3 font-mono text-[13px] tabular-nums",
                "border transition-colors duration-[80ms] disabled:opacity-50",
                active
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground active:bg-white/5",
              ].join(" ")}
              style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
            >
              {format ? format(v) : v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Minus / value / plus, then Apply.
 *
 * The one place in the system where a value does not commit on tap: a stepper
 * needs a settling moment, and sending a command per degree would spend the
 * command quota on the way from 18 to 24.
 */
export function StepperRow({
  label,
  value,
  min,
  max,
  unit,
  busy,
  busyLabel,
  action,
  onChange,
  onApply,
  last,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  busy?: boolean;
  busyLabel?: string;
  action: string;
  onChange: (value: number) => void;
  onApply: (value: number) => void;
  last?: boolean;
}) {
  return (
    <div className={`border-t border-border py-3 ${last ? "border-b" : ""}`}>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-base">{label}</span>
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={busy || value <= min}
          aria-label="−"
          className="size-11 border border-border text-lg transition-colors duration-[80ms] active:bg-white/5 disabled:opacity-40"
        >
          −
        </button>
        <span className="w-14 text-center text-xl font-light tabular-nums">
          {value}
          {unit}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={busy || value >= max}
          aria-label="+"
          className="size-11 border border-border text-lg transition-colors duration-[80ms] active:bg-white/5 disabled:opacity-40"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onApply(value)}
          disabled={busy}
          className="min-h-11 px-3 transition-colors duration-[80ms] active:bg-white/5 disabled:opacity-50"
        >
          {busy ? (
            <PendingCounter label={busyLabel ?? "…"} />
          ) : (
            <Mono className="text-primary">{action}</Mono>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * A value you can correct, in place.
 *
 * The right-hand side of a row becomes an input rather than opening a form: the
 * screen already lists the value, and a form would show it a second time in a
 * different place. Editing where you read is the shortest possible correction.
 *
 * There is no per-field save — the screen commits once, because a document is
 * corrected as a whole and five separate saves would be five chances to leave
 * it half-fixed.
 */
export function InputRow({
  label,
  value,
  onChange,
  unit,
  type = "text",
  placeholder,
  last,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  type?: "text" | "number" | "date";
  placeholder?: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 border-t border-border ${last ? "border-b" : ""}`}
      style={{ minHeight: "var(--v2-row)" }}
    >
      <span className="min-w-0 flex-1 truncate text-base">{label}</span>
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        // 15px, not smaller: iOS zooms the page on focus below 16px, and a
        // zoomed page is a layout the design never accounted for.
        className="min-h-11 w-[46%] bg-transparent text-right text-[15px] tabular-nums outline-none placeholder:text-muted-foreground/50"
        style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
      />
      {unit && <Mono className="shrink-0 text-muted-foreground">{unit}</Mono>}
    </div>
  );
}

/** A time, then Apply. Native time input — nobody wants a custom clock. */
export function TimeRow({
  label,
  value,
  busy,
  busyLabel,
  action,
  onChange,
  onApply,
  last,
}: {
  label: string;
  value: string;
  busy?: boolean;
  busyLabel?: string;
  action: string;
  onChange: (value: string) => void;
  onApply: (value: string) => void;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 border-t border-border ${last ? "border-b" : ""}`}
      style={{ minHeight: "var(--v2-row)" }}
    >
      <span className="min-w-0 flex-1 truncate text-base">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        // 15px, not smaller: iOS zooms the page on focus below 16px, and a
        // zoomed page on a phone is a layout the design never accounted for.
        className="min-h-11 bg-transparent text-right text-[15px] tabular-nums outline-none"
        style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
      />
      <button
        type="button"
        onClick={() => onApply(value)}
        disabled={busy}
        className="min-h-11 px-2 transition-colors duration-[80ms] active:bg-white/5 disabled:opacity-50"
      >
        {busy ? (
          <PendingCounter label={busyLabel ?? "…"} />
        ) : (
          <Mono className="text-primary">{action}</Mono>
        )}
      </button>
    </div>
  );
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
// Bars — for a comparison over time, where the arc would be style over meaning
// ---------------------------------------------------------------------------

/**
 * Money or energy per month. Deliberately NOT an arc: an arc reads a level, and
 * a series of months is a comparison. Using the house instrument here would
 * have been decoration pretending to be information.
 *
 * No axis, no gridlines, no tooltip. The two numbers under it — the average and
 * the current month — are the whole reading.
 */
export function Bars({
  items,
  footerLeft,
  footerRight,
}: {
  items: { key: string; label: string; value: number }[];
  footerLeft?: string;
  footerRight?: string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 0);

  return (
    <div>
      <div className="flex h-[108px] items-end gap-2.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          // A zero-value month must still be visible as a month that happened,
          // so the floor is 2px rather than nothing at all.
          const pct = max > 0 ? Math.max(2, (item.value / max) * 100) : 2;
          return (
            <div key={item.key} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full origin-bottom"
                style={{
                  height: `${pct}%`,
                  background: last ? "var(--primary)" : "oklch(0.97 0 0 / 14%)",
                }}
              />
              <span
                className="font-mono text-[9px] uppercase"
                style={{
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  color: last ? "var(--primary)" : "var(--v2-faint)",
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-0.5 h-px bg-border" />
      {(footerLeft || footerRight) && (
        <div className="mt-1.5 flex justify-between">
          <Mono className="text-muted-foreground">{footerLeft}</Mono>
          <Mono className="text-primary">{footerRight}</Mono>
        </div>
      )}
    </div>
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
