"use client";

import { useTranslations } from "next-intl";

import type { DoorsState, VehicleState, WindowsState } from "@/types/vehicle";

/**
 * What is open, and how old that answer is.
 *
 * This replaces a drawing of the car. Five attempts at that drawing, three of
 * them thrown away, and the verdict on the last was that it looked like a child
 * drew it — which was correct, and not about draughtsmanship. A representational
 * illustration is judged as an illustration, and at 208px on a phone it loses
 * that judgement however the geometry is fixed.
 *
 * The job survives the picture. `doorsOpen` and `windowsOpen` arrive per corner
 * and no row below can say WHICH one without becoming four rows nobody wants.
 * So: chips always, and a schematic — a rounded rectangle with marks on it, not
 * a car — only when something is actually open. Nobody looks at a rounded
 * rectangle and calls it badly drawn.
 *
 * Three things the drawings taught that apply to anything showing state, and
 * that this file has to keep obeying. The full list of what five attempts got
 * wrong is in docs/REDESIGN-V2.md; only the transferable part is repeated here,
 * because the rest is about car geometry and would be noise:
 *
 *   · **`null` is not "closed".** A panel that reports shut for a car that has
 *     said nothing is a confident lie rendered identically to a reading. It is
 *     the same defect as the status row that fell through to "Parcată".
 *   · **State outranks structure.** Anything decorative added here loses to an
 *     amber mark, always. If they compete, the decoration goes.
 *   · **Look at it rendered.** Every real defect in this component's ancestry
 *     was invisible in the source and obvious in a picture.
 */

/** v2's Mono went with v2; this is the same voice, kept local. */
function Mono({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}

const OPEN = "var(--chart-3)"; // amber — open, and usually should not be
const LIVE = "var(--chart-2)"; // green — running on purpose

/** null means the car has not said. Never drawn as "closed". */
type Tri = boolean | null;

interface Group {
  open: Tri;
  count: number;
}

function summarise(group: DoorsState | WindowsState | null | undefined): Group {
  if (group == null) return { open: null, count: 0 };
  const count = Object.values(group).filter(Boolean).length;
  return { open: count > 0, count };
}

export function StatusPanel({
  state,
  age,
  onRefresh,
  refreshing,
}: {
  state: VehicleState | undefined;
  /** How old the reading is, already worded. Absent when there is no reading. */
  age?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const t = useTranslations("v2");

  const doors = summarise(state?.doorsOpen);
  const windows = summarise(state?.windowsOpen);
  const frunk = state?.isFrunkOpen ?? null;
  const trunk = state?.isTrunkOpen ?? null;
  const port = state?.isChargePortOpen ?? null;
  const charging = state?.chargingState === "charging";

  const chips = [
    { key: "doors", label: t("chip_doors"), open: doors.open, count: doors.count },
    { key: "windows", label: t("chip_windows"), open: windows.open, count: windows.count },
    { key: "frunk", label: t("chip_frunk"), open: frunk, count: 0 },
    { key: "trunk", label: t("chip_trunk"), open: trunk, count: 0 },
    { key: "port", label: t("chip_port"), open: port, count: 0, live: charging },
  ];

  // The schematic costs vertical space, so it appears only when it has an
  // answer to give. Windows are deliberately NOT on it — eight marks on one
  // small shape is too many, and which window is down rarely changes what you
  // do — so an open window must not summon it. Left as "anything open" it drew
  // an empty schematic for windows-down: a diagram with nothing lit on it,
  // which is worse than no diagram. Found in a render, not in the source.
  const showFootprint =
    doors.open === true || frunk === true || trunk === true || port === true;

  const spoken = chips
    .filter((c) => c.open === true)
    .map((c) => (c.count > 1 ? `${c.label} ${c.count}` : c.label))
    .join(", ");

  return (
    <section aria-label={spoken || t("nothing_open")}>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Chip key={c.key} label={c.label} open={c.open} count={c.count} live={c.live} />
        ))}
      </div>

      {showFootprint && (
        <div className="mt-4 flex justify-center">
          <Footprint
            doors={state?.doorsOpen ?? null}
            frunk={frunk}
            trunk={trunk}
            port={port}
            charging={charging}
          />
        </div>
      )}

      {age && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="mt-2 flex min-h-11 items-center gap-2 transition-opacity duration-[80ms] active:opacity-60 disabled:opacity-40"
        >
          <Mono className="text-muted-foreground">
            {`${t("updated")} ${age} · ${refreshing ? t("loading") : t("refresh_state")}`}
          </Mono>
        </button>
      )}
    </section>
  );
}

function Chip({
  label,
  open,
  count,
  live,
}: {
  label: string;
  open: Tri;
  count: number;
  live?: boolean;
}) {
  const tone = live ? LIVE : open === true ? OPEN : undefined;
  return (
    <span
      className="flex items-center gap-2 rounded-full border px-3 py-1.5"
      style={{ borderColor: tone ? `color-mix(in oklab, ${tone} 45%, transparent)` : "var(--border)" }}
    >
      <span
        className="block size-[7px] shrink-0 rounded-full"
        style={
          open == null
            ? { border: "1px dotted var(--v2-faint)" }
            : { background: tone ?? "oklch(0.97 0 0 / 22%)" }
        }
      />
      <Mono style={{ color: tone ?? "var(--muted-foreground)" }}>
        {count > 1 ? `${count} ${label}` : label}
      </Mono>
    </span>
  );
}

// A schematic, deliberately: a rounded rectangle with marks where the openings
// are. It is not a picture of a car and must never drift into being one — the
// moment it has a windscreen it is back to being judged as an illustration.
const W = 120;
const H = 168;
const L = 18;
const R = W - L;

function Footprint({
  doors,
  frunk,
  trunk,
  port,
  charging,
}: {
  doors: DoorsState | null;
  frunk: Tri;
  trunk: Tri;
  port: Tri;
  charging: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="presentation"
      style={{ width: "min(30vw, 118px)", height: "auto" }}
    >
      <rect
        x={L}
        y={8}
        width={R - L}
        height={H - 16}
        rx={30}
        fill="none"
        stroke="oklch(0.97 0 0 / 22%)"
        strokeWidth="1.4"
      />
      <Bar x={L - 2} y={48} vertical open={doors?.frontLeft ?? null} />
      <Bar x={R - 2} y={48} vertical open={doors?.frontRight ?? null} />
      <Bar x={L - 2} y={96} vertical open={doors?.rearLeft ?? null} />
      <Bar x={R - 2} y={96} vertical open={doors?.rearRight ?? null} />
      <Bar x={W / 2 - 22} y={6} open={frunk} />
      <Bar x={W / 2 - 22} y={H - 10} open={trunk} />
      <rect
        x={L - 5}
        y={128}
        width={9}
        height={13}
        rx={3}
        fill="none"
        strokeWidth="2.4"
        stroke={charging ? LIVE : port === true ? OPEN : "oklch(0.97 0 0 / 18%)"}
        className={charging ? "v2-pulse" : undefined}
      />
    </svg>
  );
}

/** One opening. Dotted when the car has not said, which is fainter than shut. */
function Bar({
  x,
  y,
  vertical,
  open,
}: {
  x: number;
  y: number;
  vertical?: boolean;
  open: Tri;
}) {
  const w = vertical ? 4 : 44;
  const h = vertical ? 26 : 4;
  if (open == null) {
    return (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
    );
  }
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={2}
      fill={open ? OPEN : "oklch(0.97 0 0 / 18%)"}
      style={{ transition: "fill 200ms ease" }}
    />
  );
}
