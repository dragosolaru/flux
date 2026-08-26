"use client";

import { useTranslations } from "next-intl";

import type { DoorsState, VehicleState, WindowsState } from "@/types/vehicle";

/**
 * The car, seen from above, showing what is open and what is running.
 *
 * The second instrument in the system, and it had to earn that. The arc's
 * justification is "a number that IS a level"; this one's is **position**.
 * `doorsOpen` and `windowsOpen` arrive per corner from both the Tesla adapter
 * and the simulator, and all eight booleans were read and discarded — no row
 * can say WHICH window is down without becoming four rows nobody wants.
 *
 * Lock, climate, charging and sentry are repeated from the rows below on
 * purpose: rows are read one at a time to change something, the car is read at
 * a glance to see what you left open.
 *
 * ── on the geometry ──────────────────────────────────────────────────────────
 * Every proportion below comes from the real car rather than from taste. The
 * first drawing was 3.05:1 against a Model 3 that is 2.54:1 — twenty per cent
 * too long — which is exactly why it read as a capsule, and which was invisible
 * from the source. Each attempt was checked against a rendered sheet of all
 * eight states; three were thrown away. Faults that only a picture shows:
 *
 *   · doors rotating INTO the cabin (the left/right angle signs were swapped)
 *   · a glasshouse at 90% of body width, which reads as a lid
 *   · `opacity` on the glass elements instead of `fill-opacity`, so the whole
 *     shape vanished — outline included — whenever the climate was off
 */

// Tesla Model 3, in millimetres. Turned into ratios so the drawing scales with
// the body width and cannot drift out of proportion by hand.
const MM = {
  length: 4694,
  width: 1849,
  mirrors: 2089,
  wheelbase: 2875,
  frontOverhang: 841,
  track: 1580,
} as const;

const W = 132; // body width in user units
const CX = 100;
const L = Math.round((W * MM.length) / MM.width); // 335 — the 2.54:1 that matters
const X0 = CX - W / 2;
const X1 = CX + W / 2;
const Y0 = 16;
const Y1 = Y0 + L;
/** A fraction of the car's length, as a y coordinate. */
const at = (f: number) => Math.round(Y0 + L * f);
const AXLE_F = at(MM.frontOverhang / MM.length);
const AXLE_R = at((MM.frontOverhang + MM.wheelbase) / MM.length);
const MIRROR = Math.round((W * MM.mirrors) / MM.width / 2);
const TRACK = ((MM.track / MM.width) * W) / 2;

// Glasshouse: 58% of the body width, which is what a real one is.
const GT = at(0.32);
const GB = at(0.8);
const GHW = 38; // glass half-width at the roof
const D_F = at(0.34);
const D_M = at(0.53);
const D_R = at(0.7);

const OPEN = "var(--chart-3)"; // amber — open, and usually should not be
const LIVE = "var(--chart-2)"; // green — running on purpose
const IDLE = "oklch(0.97 0 0 / 30%)";
const BODY = "oklch(0.97 0 0 / 62%)";
const UNKNOWN = "oklch(0.97 0 0 / 10%)";

/** null means the car has not said. Never drawn as "closed". */
type Tri = boolean | null;

function strokeFor(open: Tri): string {
  if (open === true) return OPEN;
  if (open === false) return IDLE;
  return UNKNOWN;
}

export function CarDiagram({ state }: { state: VehicleState | undefined }) {
  const t = useTranslations("v2");

  const doors = state?.doorsOpen ?? null;
  const windows = state?.windowsOpen ?? null;
  const locked = state?.isLocked ?? null;
  const climate = state?.isClimateOn ?? null;
  const charging = state?.chargingState === "charging";
  const sentry = state?.isSentryMode ?? null;
  const frunk = state?.isFrunkOpen ?? null;
  const trunk = state?.isTrunkOpen ?? null;

  // The whole outline carries the lock: the only state with a consequence
  // while you are not standing next to the car.
  const bodyStroke = locked === false ? OPEN : BODY;
  const glassFill = climate ? 0.16 : 0;

  // Spoken aloud for anyone not looking at it. A diagram with no text
  // alternative is a diagram that excludes people.
  const summary = [
    locked === false ? t("state_unlocked") : locked === true ? t("state_locked") : null,
    climate ? t("climate_running") : null,
    charging ? t("motion_charging") : null,
    sentry ? t("sentry_on") : null,
    anyOpen(doors) ? t("door_open") : null,
    anyOpen(windows) ? t("window_open") : null,
    frunk ? t("frunk_open") : null,
    trunk ? t("trunk_open") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex justify-center">
      <svg
        viewBox="0 0 200 375"
        role="img"
        aria-label={summary || t("car_state_unknown")}
        className="v2-car"
        style={{ width: "min(50vw, 196px)", height: "auto" }}
      >
        {[
          [CX - TRACK, AXLE_F],
          [CX + TRACK, AXLE_F],
          [CX - TRACK, AXLE_R],
          [CX + TRACK, AXLE_R],
        ].map(([cx, cy]) => (
          <rect
            key={`${cx}-${cy}`}
            x={cx - 5}
            y={cy - 17}
            width={10}
            height={34}
            rx={5}
            fill="none"
            stroke={IDLE}
            strokeWidth="1.4"
          />
        ))}

        {/* Body. Nose slightly narrower than the tail, so the two ends stop
            being interchangeable. */}
        <path
          d={`M${CX} ${Y0}
              C${CX - 30} ${Y0} ${X0 + 10} ${Y0 + 20} ${X0 + 7} ${at(0.2)}
              C${X0} ${at(0.32)} ${X0} ${at(0.42)} ${X0} ${at(0.52)}
              C${X0} ${at(0.66)} ${X0 + 1} ${at(0.8)} ${X0 + 6} ${at(0.9)}
              C${X0 + 11} ${Y1 - 6} ${CX - 24} ${Y1} ${CX} ${Y1}
              C${CX + 24} ${Y1} ${X1 - 11} ${Y1 - 6} ${X1 - 6} ${at(0.9)}
              C${X1 - 1} ${at(0.8)} ${X1} ${at(0.66)} ${X1} ${at(0.52)}
              C${X1} ${at(0.42)} ${X1} ${at(0.32)} ${X1 - 7} ${at(0.2)}
              C${X1 - 10} ${Y0 + 20} ${CX + 30} ${Y0} ${CX} ${Y0} Z`}
          fill="none"
          stroke={bodyStroke}
          strokeWidth="2"
          className="v2-draw"
          style={{ transition: "stroke 200ms ease" }}
        />

        {/* Windscreen, roof, rear glass. Three shapes, because one blob reads as
            a lid. Only the FILL fades — putting opacity on the element took the
            outline with it. */}
        <Glass d={`M${CX - 24} ${GT} L${CX - GHW} ${GT + 34} L${CX + GHW} ${GT + 34} L${CX + 24} ${GT} Z`} fillOpacity={glassFill} breathing={!!climate} />
        <Glass d={`M${CX - GHW} ${GT + 34} L${CX - GHW} ${GB - 38} L${CX + GHW} ${GB - 38} L${CX + GHW} ${GT + 34}`} fillOpacity={glassFill} breathing={!!climate} />
        <Glass d={`M${CX - GHW} ${GB - 38} L${CX - 28} ${GB} L${CX + 28} ${GB} L${CX + GHW} ${GB - 38} Z`} fillOpacity={glassFill} breathing={!!climate} />

        {/* Mirrors sit at the front third and are what tells you, at a glance,
            which end is the front. */}
        <path d={`M${X0 + 1} ${at(0.33)} L${CX - MIRROR} ${at(0.315)}`} stroke={IDLE} strokeWidth="1.8" strokeLinecap="round" />
        <path d={`M${X1 - 1} ${at(0.33)} L${CX + MIRROR} ${at(0.315)}`} stroke={IDLE} strokeWidth="1.8" strokeLinecap="round" />

        {/* A window that is down colours a segment of the car's own side: the
            outline itself opens, which nothing else in the drawing does. */}
        <Window x={X0 + 1} y1={D_F + 8} y2={D_M - 4} open={windows?.frontLeft ?? null} />
        <Window x={X1 - 1} y1={D_F + 8} y2={D_M - 4} open={windows?.frontRight ?? null} />
        <Window x={X0 + 1} y1={D_M + 4} y2={D_R - 6} open={windows?.rearLeft ?? null} />
        <Window x={X1 - 1} y1={D_M + 4} y2={D_R - 6} open={windows?.rearRight ?? null} />

        <Door x={X0 + 2} y={D_F} len={D_M - D_F} side="left" open={doors?.frontLeft ?? null} />
        <Door x={X1 - 2} y={D_F} len={D_M - D_F} side="right" open={doors?.frontRight ?? null} />
        <Door x={X0 + 1} y={D_M} len={D_R - D_M} side="left" open={doors?.rearLeft ?? null} />
        <Door x={X1 - 1} y={D_M} len={D_R - D_M} side="right" open={doors?.rearRight ?? null} />

        {/* Lids that lift away from the body. */}
        <path
          d={`M${CX - 30} ${at(0.13)} C${CX - 16} ${at(0.105)} ${CX + 16} ${at(0.105)} ${CX + 30} ${at(0.13)}`}
          fill="none"
          stroke={strokeFor(frunk)}
          strokeWidth="2"
          style={{
            transform: frunk ? "translateY(-11px)" : "none",
            transition: "transform 260ms cubic-bezier(.22,1,.36,1), stroke 200ms ease",
          }}
        />
        <path
          d={`M${CX - 32} ${at(0.87)} C${CX - 17} ${at(0.895)} ${CX + 17} ${at(0.895)} ${CX + 32} ${at(0.87)}`}
          fill="none"
          stroke={strokeFor(trunk)}
          strokeWidth="2"
          style={{
            transform: trunk ? "translateY(11px)" : "none",
            transition: "transform 260ms cubic-bezier(.22,1,.36,1), stroke 200ms ease",
          }}
        />

        {/* Charge port — rear left on every Tesla. Pulses only while power is
            actually flowing. */}
        <rect
          x={X0 - 1}
          y={at(0.845)}
          width={9}
          height={15}
          rx={3.5}
          fill="none"
          strokeWidth="2.2"
          stroke={charging ? LIVE : IDLE}
          className={charging ? "v2-pulse" : undefined}
          style={{ transition: "stroke 200ms ease" }}
        />

        {/* Sentry sits at the windscreen, because that is where it watches from.
            A ring rather than a camera glyph: at this size a glyph is four grey
            pixels. */}
        {sentry === true && (
          <circle cx={CX} cy={at(0.3)} r={5} fill="none" stroke={LIVE} strokeWidth="2" className="v2-pulse" />
        )}
      </svg>
    </div>
  );
}

function anyOpen(group: DoorsState | WindowsState | null): boolean {
  return group != null && Object.values(group).some(Boolean);
}

function Glass({
  d,
  fillOpacity,
  breathing,
}: {
  d: string;
  fillOpacity: number;
  breathing: boolean;
}) {
  return (
    <path
      d={d}
      fill={LIVE}
      fillOpacity={fillOpacity}
      stroke={IDLE}
      strokeWidth="1.3"
      strokeLinejoin="round"
      className={breathing ? "v2-breathe" : undefined}
      style={{ transition: "fill-opacity 220ms ease" }}
    />
  );
}

function Door({
  x,
  y,
  len,
  side,
  open,
}: {
  x: number;
  y: number;
  len: number;
  side: "left" | "right";
  open: Tri;
}) {
  // Left takes a positive angle and right a negative one. Reversed — which is
  // how the first version shipped in draft — every door opens into the cabin.
  const angle = open === true ? (side === "left" ? 46 : -46) : 0;
  return (
    // rotate(a cx cy) carries its own centre, so it cannot be misread the way a
    // CSS transform-origin in pixels was.
    <g
      transform={`rotate(${angle} ${x} ${y})`}
      style={{ transition: "transform 260ms cubic-bezier(.22,1,.36,1)" }}
    >
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + len}
        stroke={strokeFor(open)}
        strokeWidth={open === true ? 2.5 : 1.3}
        strokeLinecap="round"
        style={{ transition: "stroke 200ms ease, stroke-width 200ms ease" }}
      />
    </g>
  );
}

function Window({ x, y1, y2, open }: { x: number; y1: number; y2: number; open: Tri }) {
  return (
    <line
      x1={x}
      y1={y1}
      x2={x}
      y2={y2}
      stroke={open === true ? OPEN : "transparent"}
      strokeWidth="4"
      strokeLinecap="round"
      style={{ transition: "stroke 200ms ease" }}
    />
  );
}
