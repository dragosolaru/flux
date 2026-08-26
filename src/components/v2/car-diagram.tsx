"use client";

import { useTranslations } from "next-intl";

import type { DoorsState, VehicleState, WindowsState } from "@/types/vehicle";

/**
 * The car, seen from above, showing what is open and what is running.
 *
 * This is the second instrument in the system and it had to earn that. The test
 * the arc passes is "a number that IS a level"; the one this passes is
 * **position**. `doorsOpen` and `windowsOpen` arrive per corner from both the
 * Tesla adapter and the simulator, and every one of those eight booleans was
 * read and thrown away — no row can say WHICH window is down without becoming
 * four rows nobody wants.
 *
 * Everything else it shows — lock, climate, charging, sentry — is also a row
 * below it. That repetition is deliberate: rows are read one at a time when you
 * want to change something, the car is read at a glance when you want to know
 * whether you left something open.
 *
 * Same hairline as the rest. No shadow, no gradient, one fill. A car drawn to
 * look like a photograph would be ornament; this is a diagram.
 *
 * The geometry was drawn against a rendered sheet of all eight states rather
 * than by reasoning about coordinates — the first two attempts produced a
 * capsule with doors that swung INTO the cabin, and neither was visible from
 * the source.
 */

const OPEN = "var(--chart-3)"; // amber — open, and usually should not be
const LIVE = "var(--chart-2)"; // green — running on purpose
const IDLE = "oklch(0.97 0 0 / 18%)";
const BODY = "oklch(0.97 0 0 / 62%)";
const UNKNOWN = "oklch(0.97 0 0 / 8%)";

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

  // The whole outline carries the lock, because it is the only state with a
  // consequence while you are not standing next to the car.
  const bodyStroke = locked === false ? OPEN : BODY;

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
        viewBox="0 0 200 430"
        role="img"
        aria-label={summary || t("car_state_unknown")}
        className="v2-car"
        style={{ width: "min(50vw, 200px)", height: "auto" }}
      >
        {/* Body: flat front, straight sides, rounded corners. */}
        <path
          d="M80 20 L120 20 C144 20 156 42 159 78
             L164 170 L164 294 L160 348
             C158 386 146 410 124 410 L76 410
             C54 410 42 386 40 348 L36 294 L36 170 L40 76
             C44 42 56 20 80 20 Z"
          fill="none"
          stroke={bodyStroke}
          strokeWidth="2"
          strokeLinejoin="round"
          className="v2-draw"
          style={{ transition: "stroke 200ms ease" }}
        />

        {/* Greenhouse. The only fill in the drawing, and only while the climate
            is actually running. */}
        <path
          d="M68 166 C68 156 80 150 100 150 C120 150 132 156 132 166
             L132 268 C132 278 120 284 100 284 C80 284 68 278 68 268 Z"
          fill={climate ? LIVE : "transparent"}
          opacity={climate ? 0.14 : 0}
          stroke={IDLE}
          strokeWidth="1.4"
          className={climate ? "v2-breathe" : undefined}
          style={{ transition: "opacity 200ms ease" }}
        />
        <path d="M62 158 C74 132 126 132 138 158" fill="none" stroke={IDLE} strokeWidth="1.4" />
        <path d="M62 276 C74 302 126 302 138 276" fill="none" stroke={IDLE} strokeWidth="1.4" />

        {/* Mirrors. Long enough to read as mirrors, which is what tells you at a
            glance which end is the front. */}
        <path d="M37 166 L23 158" stroke={IDLE} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M163 166 L177 158" stroke={IDLE} strokeWidth="1.8" strokeLinecap="round" />

        {/* A window that is down colours a segment of the car's own side: the
            outline itself opens, which nothing else in the drawing does. */}
        <Window x={37} y1={172} y2={214} open={windows?.frontLeft ?? null} />
        <Window x={163} y1={172} y2={214} open={windows?.frontRight ?? null} />
        <Window x={36.5} y1={222} y2={264} open={windows?.rearLeft ?? null} />
        <Window x={163.5} y1={222} y2={264} open={windows?.rearRight ?? null} />

        {/* Doors swing out from their front hinge — the only way a top-down
            drawing can say "open". Left takes a positive angle and right a
            negative one; reversed, every door opens into the cabin. */}
        <Door x={38} y={170} side="left" open={doors?.frontLeft ?? null} />
        <Door x={162} y={170} side="right" open={doors?.frontRight ?? null} />
        <Door x={36.5} y={224} side="left" open={doors?.rearLeft ?? null} />
        <Door x={163.5} y={224} side="right" open={doors?.rearRight ?? null} />

        {/* Lids that lift away from the body. */}
        <path
          d="M62 62 C76 52 124 52 138 62"
          fill="none"
          stroke={strokeFor(frunk)}
          strokeWidth="2"
          style={{
            transform: frunk ? "translateY(-11px)" : "none",
            transition: "transform 260ms cubic-bezier(.22,1,.36,1), stroke 200ms ease",
          }}
        />
        <path
          d="M60 356 C74 366 126 366 140 356"
          fill="none"
          stroke={strokeFor(trunk)}
          strokeWidth="2"
          style={{
            transform: trunk ? "translateY(11px)" : "none",
            transition: "transform 260ms cubic-bezier(.22,1,.36,1), stroke 200ms ease",
          }}
        />

        {/* Charge port — rear left on every Tesla. It pulses only while power is
            actually flowing. */}
        <circle
          cx="40"
          cy="320"
          r="7"
          fill="none"
          strokeWidth="2.5"
          stroke={charging ? LIVE : IDLE}
          className={charging ? "v2-pulse" : undefined}
          style={{ transition: "stroke 200ms ease" }}
        />

        {/* Sentry sits at the windscreen because that is where it watches from.
            A ring rather than a camera glyph: at this size a glyph is four
            grey pixels. */}
        {sentry === true && (
          <circle cx="100" cy="112" r="5" fill="none" stroke={LIVE} strokeWidth="2" className="v2-pulse" />
        )}
      </svg>
    </div>
  );
}

function anyOpen(group: DoorsState | WindowsState | null): boolean {
  return group != null && Object.values(group).some(Boolean);
}

function Door({
  x,
  y,
  side,
  open,
}: {
  x: number;
  y: number;
  side: "left" | "right";
  open: Tri;
}) {
  const angle = open === true ? (side === "left" ? 46 : -46) : 0;
  return (
    // rotate(a cx cy) carries its own centre, so it cannot be misread the way
    // a CSS transform-origin in pixels was.
    <g
      transform={`rotate(${angle} ${x} ${y})`}
      style={{ transition: "transform 260ms cubic-bezier(.22,1,.36,1)" }}
    >
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + 54}
        stroke={strokeFor(open)}
        strokeWidth={open === true ? 2.5 : 1.4}
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
