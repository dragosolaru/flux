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
 * eight states; four were thrown away. Faults that only a picture shows:
 *
 *   · doors rotating INTO the cabin (the left/right angle signs were swapped)
 *   · a glasshouse at 90% of body width, which reads as a lid
 *   · `opacity` on the glass elements instead of `fill-opacity`, so the whole
 *     shape vanished — outline included — whenever the climate was off
 *   · glass trapezoids tapering the wrong way. In plan an A-pillar leans in as
 *     it rises, so the windscreen is WIDEST at the cowl; drawn narrow-forward
 *     it made an arrowhead pointing at the nose, which looked deliberate and
 *     was simply wrong
 *   · flanks curving continuously from nose to tail. A car is straight-sided
 *     between the arches; without that straight the silhouette is a capsule no
 *     matter what the length ratio says
 *   · both ends blunt. The car came out very nearly symmetric front-to-back,
 *     and the mirrors were the only thing saying which end was which. The nose
 *     has to taper across the front overhang — but the taper must be COMPLETE
 *     by the front axle, or the wheels stand outside the bodywork
 *   · detail put where the eye already goes. Wheels and arches drawn at
 *     shutline weight, with tread, became four dark corner blobs that outweighed
 *     every state indicator and turned to mush at 196px. Structure that appears
 *     four times needs to be a tier LIGHTER than structure that appears once
 *   · a lid that translates far enough to stop being a lid. The bonnet panel
 *     drawn full-width and lifted 11 units threw an amber horseshoe across the
 *     nose, crossing the body line; it has to stay recognisably the shape it is
 *     when shut
 *   · two unrelated shapes crossing — the headlamp swept out into the front
 *     tyre, and the join read as a broken line rather than as either part
 *
 * ── on the linework ──────────────────────────────────────────────────────────
 * Three stroke weights, and nothing outside them. A technical drawing reads
 * because the weights are a hierarchy rather than a texture: T1 is the
 * silhouette and only the silhouette, T2 is anything that is a real gap in the
 * sheet metal, T3 is surface that is neither. State always outranks structure —
 * an open door is drawn heavier than the shutline it just left.
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
  tyreWidth: 235,
  tyreDiameter: 685,
  doorThickness: 118,
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
const TYRE_W = (MM.tyreWidth / MM.width) * W;
const TYRE_L = (MM.tyreDiameter / MM.length) * L;
const DOOR_T = (MM.doorThickness / MM.width) * W;

// Glasshouse. Four stations down the car, each with a half-width; the panes are
// the trapezoids between them. Widest at the cowl and at the boot line, tightest
// across the roof, which is the shape a glasshouse actually is from above.
const COWL = at(0.32);
const HEADER = at(0.545);
const REAR_BAR = at(0.745);
const GLASS_B = at(0.85);
const GLASS: ReadonlyArray<readonly [number, number]> = [
  [COWL, 50],
  [HEADER, 37],
  [REAR_BAR, 36],
  [GLASS_B, 44],
];

/** Half-width of the glasshouse at a y inside it. */
function glassHalf(y: number): number {
  for (let i = 1; i < GLASS.length; i++) {
    const [y0, h0] = GLASS[i - 1];
    const [y1, h1] = GLASS[i];
    if (y <= y1) return h0 + ((h1 - h0) * (y - y0)) / (y1 - y0);
  }
  return GLASS[GLASS.length - 1][1];
}

const D_F = at(0.36);
const D_M = at(0.53);
const D_R = at(0.7);
const MIRROR_Y = at(0.365);
const BONNET_LEAD = at(0.105);
const BOOT_LEAD = at(0.905);
// Far enough forward to still be on the straight part of the flank. At 0.875
// the tail has begun curving in, so the flap floated a couple of units off the
// body and read as detached from the car.
const PORT_Y = at(0.825);

const OPEN = "var(--chart-3)"; // amber — open, and usually should not be
const LIVE = "var(--chart-2)"; // green — running on purpose
const IDLE = "oklch(0.97 0 0 / 30%)";
const BODY = "oklch(0.97 0 0 / 62%)";
const PANEL = "oklch(0.97 0 0 / 34%)";
const DETAIL = "oklch(0.97 0 0 / 20%)";
const UNKNOWN = "oklch(0.97 0 0 / 10%)";

// The three weights. Anything drawn outside them is a mistake.
const T1 = 2.4; // silhouette
const T2 = 1.4; // shutlines, glass edges, wheels, arches, mirrors
const T3 = 0.8; // surface detail: tread, lamp lenses, badge

/** null means the car has not said. Never drawn as "closed". */
type Tri = boolean | null;

function strokeFor(open: Tri): string {
  if (open === true) return OPEN;
  if (open === false) return IDLE;
  return UNKNOWN;
}

const LIFT = "transform 260ms cubic-bezier(.22,1,.36,1), stroke 200ms ease";

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
  const port = state?.isChargePortOpen ?? null;

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
    port ? t("charge_port_open") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex justify-center">
      <svg
        // Wider than the car. A door swings to roughly 10 units past the body
        // on each side, and an SVG clips at its viewBox — so on the one state
        // that most needs to be legible, "you left a door open", the line was
        // cut off at the edge. Found in a rendered sheet; invisible here.
        viewBox="-14 0 228 375"
        role="img"
        aria-label={summary || t("car_state_unknown")}
        className="v2-car"
        style={{ width: "min(50vw, 208px)", height: "auto" }}
      >
        <Wheel cx={CX - TRACK} cy={AXLE_F} />
        <Wheel cx={CX + TRACK} cy={AXLE_F} />
        <Wheel cx={CX - TRACK} cy={AXLE_R} />
        <Wheel cx={CX + TRACK} cy={AXLE_R} />

        {/* Arch lips, drawn on the body rather than on the wheel: from above an
            arch is where the flank stops being flat. */}
        <Arch cy={AXLE_F} />
        <Arch cy={AXLE_R} />

        {/* Body. Three things stop it being a capsule, and one stops it being a
            van: the flanks are straight between the arches, the tail is wide and
            square — and the nose tapers across the front overhang instead of
            flaring immediately. Drawn blunt at both ends the car was
            front-to-back symmetric, so nothing but the mirrors said which end
            was the front. The taper has to be COMPLETE by the front axle
            (0.175 ≈ 841/4694, the real overhang) or the front wheels stand
            outside the bodywork. */}
        <path
          d={`M${CX} ${Y0}
              C${CX - 24} ${Y0} ${X0 + 18} ${at(0.035)} ${X0 + 6} ${at(0.095)}
              C${X0 + 1} ${at(0.125)} ${X0} ${at(0.145)} ${X0} ${at(0.175)}
              L${X0} ${at(0.9)}
              C${X0} ${at(0.947)} ${X0 + 2} ${at(0.973)} ${X0 + 8} ${at(0.987)}
              C${X0 + 14} ${Y1 - 1} ${X0 + 21} ${Y1} ${CX - 44} ${Y1}
              L${CX + 44} ${Y1}
              C${X1 - 21} ${Y1} ${X1 - 14} ${Y1 - 1} ${X1 - 8} ${at(0.987)}
              C${X1 - 2} ${at(0.973)} ${X1} ${at(0.947)} ${X1} ${at(0.9)}
              L${X1} ${at(0.175)}
              C${X1} ${at(0.145)} ${X1 - 1} ${at(0.125)} ${X1 - 6} ${at(0.095)}
              C${X1 - 18} ${at(0.035)} ${CX + 24} ${Y0} ${CX} ${Y0} Z`}
          fill="none"
          stroke={bodyStroke}
          strokeWidth={T1}
          strokeLinejoin="round"
          className="v2-draw"
          style={{ transition: "stroke 200ms ease" }}
        />

        {/* Headlamps: a swept lens each side of the nose, outboard of the
            bonnet's forward corners. Two of the three things that say which end
            is the front — the mirrors are the third. */}
        <Lamp side="left" />
        <Lamp side="right" />

        {/* Tail signature. Not one bar across a Model 3, but close enough to one
            from above that drawing it as two stubs would only look broken. */}
        <path
          d={`M${CX - 42} ${at(0.958)} C${CX - 20} ${at(0.979)} ${CX + 20} ${at(0.979)} ${CX + 42} ${at(0.958)}`}
          fill="none"
          stroke={IDLE}
          strokeWidth={T2}
          strokeLinecap="round"
        />
        <path
          d={`M${CX - 37} ${at(0.976)} C${CX - 18} ${at(0.992)} ${CX + 18} ${at(0.992)} ${CX + 37} ${at(0.976)}`}
          fill="none"
          stroke={DETAIL}
          strokeWidth={T3}
          strokeLinecap="round"
        />

        {/* Windscreen, roof, rear glass. Three panes, because one blob reads as
            a lid. Only the FILL fades — putting opacity on the element took the
            outline with it. */}
        {GLASS.slice(1).map(([y1, h1], i) => {
          const [y0, h0] = GLASS[i];
          return (
            <Glass
              key={y1}
              d={`M${CX - h0} ${y0} L${CX - h1} ${y1} L${CX + h1} ${y1} L${CX + h0} ${y0} Z`}
              fillOpacity={glassFill}
              breathing={!!climate}
            />
          );
        })}

        {/* Bonnet and boot as panels rather than floating arcs: two shutlines
            and a leading edge, the whole panel carrying the state and sliding
            clear of the shell when it is open.

            Narrow, and moving barely 6 units. A wider panel translated 11 threw
            an amber horseshoe across the whole nose that overlapped the body
            line and read as an appendage rather than a lid — the lid has to
            stay recognisably the shape it is when shut. */}
        <Lid
          d={`M${CX - 30} ${COWL} L${CX - 25} ${BONNET_LEAD} C${CX - 13} ${at(0.085)} ${CX + 13} ${at(0.085)} ${CX + 25} ${BONNET_LEAD} L${CX + 30} ${COWL}`}
          open={frunk}
          shift={-6}
        />
        <Lid
          d={`M${CX - 29} ${GLASS_B} L${CX - 26} ${BOOT_LEAD} C${CX - 13} ${at(0.934)} ${CX + 13} ${at(0.934)} ${CX + 26} ${BOOT_LEAD} L${CX + 29} ${GLASS_B}`}
          open={trunk}
          shift={6}
        />

        {/* Door cuts, inboard of where the door itself ends. When a door swings
            these stay: they are the aperture, not the panel. */}
        {[D_F, D_M, D_R].map((y) => (
          <g key={y}>
            <line x1={X0 + DOOR_T} y1={y} x2={CX - glassHalf(y)} y2={y} stroke={PANEL} strokeWidth={T2} />
            <line x1={X1 - DOOR_T} y1={y} x2={CX + glassHalf(y)} y2={y} stroke={PANEL} strokeWidth={T2} />
          </g>
        ))}

        <Mirror side="left" />
        <Mirror side="right" />

        {/* A window that is down colours a segment of the car's own side: the
            outline itself opens, which nothing else in the drawing does. */}
        <Window x={X0 + 1} y1={D_F + 8} y2={D_M - 4} open={windows?.frontLeft ?? null} />
        <Window x={X1 - 1} y1={D_F + 8} y2={D_M - 4} open={windows?.frontRight ?? null} />
        <Window x={X0 + 1} y1={D_M + 4} y2={D_R - 6} open={windows?.rearLeft ?? null} />
        <Window x={X1 - 1} y1={D_M + 4} y2={D_R - 6} open={windows?.rearRight ?? null} />

        <Door x={X0 + 1} y={D_F} len={D_M - D_F} side="left" open={doors?.frontLeft ?? null} />
        <Door x={X1 - 1} y={D_F} len={D_M - D_F} side="right" open={doors?.frontRight ?? null} />
        <Door x={X0 + 1} y={D_M} len={D_R - D_M} side="left" open={doors?.rearLeft ?? null} />
        <Door x={X1 - 1} y={D_M} len={D_R - D_M} side="right" open={doors?.rearRight ?? null} />

        {/* Charge port — rear left on every Tesla. The flap swings clear of the
            body when it is open, the same way the lids lift; green and pulsing
            only while power is actually flowing, amber when it is standing open
            on a car that is not charging. */}
        <rect
          x={X0}
          y={PORT_Y}
          width={8}
          height={13}
          rx={3}
          fill="none"
          strokeWidth={T1}
          stroke={charging ? LIVE : strokeFor(port)}
          className={charging ? "v2-pulse" : undefined}
          style={{ transform: port ? "translateX(-5px)" : "none", transition: LIFT }}
        />

        {/* Sentry sits at the windscreen, because that is where it watches from.
            A ring rather than a camera glyph: at this size a glyph is four grey
            pixels. */}
        {sentry === true && (
          <circle cx={CX} cy={at(0.4)} r={5} fill="none" stroke={LIVE} strokeWidth="2" className="v2-pulse" />
        )}
      </svg>
    </div>
  );
}

function anyOpen(group: DoorsState | WindowsState | null): boolean {
  return group != null && Object.values(group).some(Boolean);
}

// Wheels and arches are structure, not state, and they sit at the four corners
// — the most attention-grabbing places on the drawing. Drawn at T2 in IDLE with
// tread grooves they became four dark blobs that outweighed every state
// indicator and turned to mush at 196px. They are down a full tier: the tyre is
// the only line, and it is a detail-weight one.
function Wheel({ cx, cy }: { cx: number; cy: number }) {
  return (
    <rect
      x={cx - TYRE_W / 2}
      y={cy - TYRE_L / 2}
      width={TYRE_W}
      height={TYRE_L}
      rx={3}
      fill="none"
      stroke={DETAIL}
      strokeWidth={T2}
    />
  );
}

function Arch({ cy }: { cy: number }) {
  const top = cy - TYRE_L / 2 - 4;
  const bottom = cy + TYRE_L / 2 + 4;
  const bulge = X0 + TYRE_W + 7;
  return (
    <g>
      <path
        d={`M${X0 + 2} ${top} C${bulge} ${top + 8} ${bulge} ${bottom - 8} ${X0 + 2} ${bottom}`}
        fill="none"
        stroke={DETAIL}
        strokeWidth={T3}
      />
      <path
        d={`M${X1 - 2} ${top} C${2 * CX - bulge} ${top + 8} ${2 * CX - bulge} ${bottom - 8} ${X1 - 2} ${bottom}`}
        fill="none"
        stroke={DETAIL}
        strokeWidth={T3}
      />
    </g>
  );
}

function Lamp({ side }: { side: "left" | "right" }) {
  const s = side === "left" ? -1 : 1;
  const x = (d: number) => CX + s * d;
  return (
    <g>
      {/* Held inboard of x(46) and forward of 0.115. Swept out to x(52) it ran
          into the front tyre, which starts at x(48) — two unrelated shapes
          crossing, and it read as a broken line rather than a lamp. */}
      <path
        d={`M${x(22)} ${at(0.062)} C${x(33)} ${at(0.068)} ${x(41)} ${at(0.088)} ${x(45)} ${at(0.118)}`}
        fill="none"
        stroke={IDLE}
        strokeWidth={T2}
        strokeLinecap="round"
      />
      <path
        d={`M${x(23)} ${at(0.082)} C${x(32)} ${at(0.087)} ${x(38)} ${at(0.102)} ${x(41)} ${at(0.124)}`}
        fill="none"
        stroke={DETAIL}
        strokeWidth={T3}
        strokeLinecap="round"
      />
    </g>
  );
}

function Mirror({ side }: { side: "left" | "right" }) {
  const s = side === "left" ? -1 : 1;
  const root = CX + s * (W / 2 - 1);
  const tip = CX + s * MIRROR;
  return (
    <g>
      <line x1={root} y1={MIRROR_Y} x2={tip + s * -2} y2={MIRROR_Y - 2} stroke={IDLE} strokeWidth={T2} strokeLinecap="round" />
      <path
        d={`M${tip} ${MIRROR_Y - 5} C${tip + s * -3} ${MIRROR_Y - 6} ${tip + s * -6} ${MIRROR_Y - 4} ${tip + s * -6} ${MIRROR_Y}
            C${tip + s * -6} ${MIRROR_Y + 3} ${tip + s * -3} ${MIRROR_Y + 4} ${tip} ${MIRROR_Y + 3} Z`}
        fill="none"
        stroke={IDLE}
        strokeWidth={T2}
        strokeLinejoin="round"
      />
    </g>
  );
}

function Lid({ d, open, shift }: { d: string; open: Tri; shift: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={strokeFor(open)}
      strokeWidth={open === true ? 2.4 : T2}
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{
        transform: open ? `translateY(${shift}px)` : "none",
        transition: LIFT + ", stroke-width 200ms ease",
      }}
    />
  );
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
      stroke={PANEL}
      strokeWidth={T2}
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
  const i = side === "left" ? DOOR_T : -DOOR_T;
  return (
    // rotate(a cx cy) carries its own centre, so it cannot be misread the way a
    // CSS transform-origin in pixels was.
    <g
      transform={`rotate(${angle} ${x} ${y})`}
      style={{ transition: "transform 260ms cubic-bezier(.22,1,.36,1)" }}
    >
      {/* The panel has a thickness, so an open door is a door and not a stick.
          Closed, its two ends land on the door cuts already in the shell. */}
      <path
        d={`M${x + i} ${y} L${x} ${y} L${x} ${y + len} L${x + i} ${y + len}`}
        fill="none"
        stroke={strokeFor(open)}
        strokeWidth={open === true ? 2.6 : T2}
        strokeLinejoin="round"
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
