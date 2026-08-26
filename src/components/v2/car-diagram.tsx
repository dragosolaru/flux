"use client";

import { useTranslations } from "next-intl";

import type { DoorsState, VehicleState, WindowsState } from "@/types/vehicle";

/**
 * The car, seen from the front three-quarter, showing what is open and what is
 * running.
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
 * It is a generic EV fastback saloon, not a Tesla. The commands on this screen
 * act on ALL doors and ALL windows at once, so the per-corner precision that
 * paid for the old plan view is precision the controls never use — and a
 * three-quarter reads as "your car" to someone who has never studied a
 * blueprint. The proportions are still measured (see `MM`); only the badge is
 * gone.
 *
 * ── on the projection ────────────────────────────────────────────────────────
 * ORTHOGRAPHIC, azimuth 52° round the nose toward the car's LEFT, elevation 24°.
 * Parallel, not perspective: at 300px wide the convergence of a real camera is
 * about a pixel, while the risk it brings — different parts drawn to different
 * vanishing points, which is how this kind of drawing usually dies — is total.
 * Parallel projection makes that failure impossible by construction, because
 * every coordinate in the file goes through ONE function, `q(x, y, z)`.
 *
 * Car space is millimetres: +x rearward from the nose, +y toward the car's LEFT
 * (the near side), +z up from the road. Left-near is not arbitrary — the charge
 * port is rear left, so this is the side that keeps it in view.
 *
 * 52° is chosen so the front face is about a quarter of the silhouette: less
 * and the car reads head-on, more and the flank flattens. The elevation is the
 * number that was got wrong twice, and the one worth explaining. What it
 * controls is the angle between the two ground directions ON SCREEN:
 *
 *     atan(sin φ · cot 52°) + atan(sin φ · tan 52°)
 *
 * — 28° at φ=14°, 45° at φ=24°. That angle IS the drawing's grip on horizontal
 * surfaces. At 28° every horizontal panel collapses towards a line, and the
 * bonnet, the roof and the boot lid all read as slivers no matter how they are
 * drawn. 24° buys them back and still reads as "slightly above": the roof is a
 * band, not a plane you are standing over. Consequences worth knowing, all of
 * them measured off the projection rather than guessed:
 *
 *   · a 1849mm car shifts its far side 60 units up-left of its near side. That
 *     parallax is larger than most of the detail, so far-side marks land well
 *     forward of the near-side ones. Correct, and it takes getting used to.
 *   · the far flank, far sill and far glass are geometrically INVISIBLE from
 *     here — the roof occludes them. Anything the far side has to say is said
 *     on the far roof rail, which is the only far-side edge the eye can reach.
 *     A far door that opens swings its top edge up and LEFT, out past that
 *     rail; that sliver is the whole of "you left the other door open".
 *   · surfaces are painted back to front: unstroked background fills, then the
 *     edges that are actually visible. Hidden lines are removed by hand, edge
 *     by edge, because there is no hidden-line solver here — which is why the
 *     silhouette set (T1) is enumerated explicitly and is NOT the same as "the
 *     outline of the near side".
 *
 * ── on the linework ──────────────────────────────────────────────────────────
 * Three stroke weights, and nothing outside them. A technical drawing reads
 * because the weights are a hierarchy rather than a texture: T1 is the
 * silhouette and only the silhouette, T2 is anything that is a real gap in the
 * sheet metal, T3 is surface that is neither. State always outranks structure —
 * an open door is drawn heavier than the shutline it just left.
 *
 * ── faults, all of which took a render to see ────────────────────────────────
 * The file's memory. Every one of these was invisible in the source and obvious
 * in a picture. The first nine are from the plan-view drawings this replaces;
 * they are kept because every one of them is a way to fail at ANY view.
 *
 *   · a 3.05:1 body against a car that is 2.54:1 — twenty per cent too long,
 *     which is exactly why it read as a capsule
 *   · doors rotating INTO the cabin (the left/right angle signs were swapped)
 *   · a glasshouse at 90% of body width, which reads as a lid
 *   · `opacity` on the glass elements instead of `fill-opacity`, so the whole
 *     shape vanished — outline included — whenever the climate was off
 *   · glass trapezoids tapering the wrong way
 *   · flanks curving continuously from nose to tail. A car is straight-sided
 *     between the arches; without that straight the silhouette is a capsule no
 *     matter what the length ratio says
 *   · both ends blunt, so the car was very nearly symmetric front-to-back and
 *     the mirrors were the only thing saying which end was which
 *   · detail put where the eye already goes. Wheels and arches at shutline
 *     weight became four dark corner blobs that outweighed every state
 *     indicator. Structure that appears four times needs to be a tier LIGHTER
 *     than structure that appears once
 *   · a lid that translates far enough to stop being a lid: a bonnet drawn
 *     full-width and slid 11 units threw an amber horseshoe across the nose
 *   · two unrelated shapes crossing — a headlamp swept into the front tyre
 *
 * and from this drawing:
 *
 *   · `v2-breathe` animates `opacity`, so putting it on the stroked glass path
 *     did exactly what the fourth fault above warns about: the pane outlines
 *     faded to 5% twice a cycle while the climate ran. The tint is now a
 *     separate, stroke-less overlay and only the tint breathes.
 *   · a near-side outline stroked as one closed path. Half of it is not the
 *     silhouette — the bonnet/wing crease and the near roof rail are interior
 *     edges — so the car was drawn with a T1 line running through its middle
 *     and the hierarchy stopped meaning anything. Fills and strokes are now
 *     separate paths: fills are closed and silent, strokes are enumerated.
 *   · doors that swing by recomputing their geometry cannot be moved by a CSS
 *     transform, so the swing lost its animation. `transition: d` restores it
 *     wherever the browser has the SVG2 `d` property (all of Chrome/Safari, and
 *     Firefox since 97); everywhere else it snaps, which is the correct thing
 *     for a state change to do.
 *   · elevation 14°, which is what "slightly above" sounds like it means. See
 *     the projection note: it flattened every horizontal panel. The frunk was
 *     the tell — a raised bonnet drawn as a spear across the nose.
 *   · a lid opened by "a bit". A panel hinged at the cowl turns AWAY from a
 *     viewer standing in front of it, so it passes edge-on at 44° and a bonnet
 *     cracked open 30° is less visible than a shut one. It has to go past that,
 *     to 70°, where what you see is its underside — which is also what you see
 *     standing in front of a car with the frunk up.
 *   · a flat rear deck over a tall vertical tail read as a pickup bed. A
 *     fastback needs the backlight steep and the deck short; the give-away was
 *     that the boot lid looked like a tailgate.
 *   · the far mirror. It is genuinely visible from here — it stands out over
 *     the far side of the bonnet — and at 300px it read as a hatch cut into the
 *     bonnet. A detail that reads as a different object is worse than none.
 *   · six silhouette paths sharing the single `stroke-dasharray: 1200` in
 *     globals.css. The short ones sit inside the gap for most of the draw-in
 *     and then pop. `pathLength={1200}` normalises them so they draw together.
 */

// A modern EV fastback saloon, in millimetres. Turned into ratios so the
// drawing scales with the projection and cannot drift out of proportion by
// hand.
const MM = {
  length: 4694,
  width: 1849,
  height: 1443,
  mirrors: 2089,
  wheelbase: 2875,
  frontOverhang: 841,
  track: 1580,
  tyreWidth: 235,
  tyreDiameter: 685,
  doorThickness: 118,
} as const;

// ── the projection ──────────────────────────────────────────────────────────
const AZ = (52 * Math.PI) / 180;
const EL = (24 * Math.PI) / 180;
const KX = Math.sin(AZ); // screen dx per mm rearward
const KY = Math.cos(AZ); // screen dx per mm toward the near side
const JX = Math.sin(EL) * Math.cos(AZ); // screen dy per mm rearward (up)
const JY = Math.sin(EL) * Math.sin(AZ); // screen dy per mm toward the near side
const JZ = Math.cos(EL); // screen dy per mm up
/** User units per millimetre. Set so the three stroke weights land where they
 *  landed on the plan view: ~0.9 device px per unit at the rendered size. */
const U = 0.053;
const OX = 27;
const OY = 138;

const n = (v: number) => Math.round(v * 10) / 10;

/** The only projection in the file. x rearward, y toward the near side, z up. */
const qx = (x: number, y: number) => OX + U * (KX * x + KY * y);
const qy = (x: number, y: number, z: number) => OY + U * (JY * y - JX * x - JZ * z);
function q(x: number, y: number, z: number): string {
  return `${n(qx(x, y))} ${n(qy(x, y, z))}`;
}

/** Half the body's widest point. Every flank coordinate is this, so the car
 *  cannot be widened by hand one point at a time. */
const HALF = Math.round(MM.width / 2);
const WHEEL_R = MM.tyreDiameter / 2;
const WHEEL_Y = MM.track / 2 + MM.tyreWidth / 2;
const AXLE_F = MM.frontOverhang;
const AXLE_R = MM.frontOverhang + MM.wheelbase;

const Z_SILL = 380;
const Z_BELT = 955;
/** How far a vented window drops. Bigger than the real vent gap on purpose: it
 *  is an indicator, and 50mm is a third of a pixel. */
const VENT = 300;

type Side = 1 | -1;
/** A point on the side profile: x rearward, z up, and the half-width of the
 *  body there. The far side is the same point with the half-width negated,
 *  which is what makes tumblehome free. */
type Pt = readonly [x: number, z: number, hw: number];
/** A point in full car space. */
type Q3 = readonly [x: number, y: number, z: number];

const at = (p: Pt, s: Side) => q(p[0], s * p[2], p[1]);

type Seg =
  | { readonly to: Pt; readonly c1: Pt; readonly c2: Pt }
  | { readonly to: Pt; readonly c1?: undefined; readonly c2?: undefined };
interface Edge {
  readonly from: Pt;
  readonly segs: readonly Seg[];
}
const cv = (c1: Pt, c2: Pt, to: Pt): Seg => ({ c1, c2, to });
const ln = (to: Pt): Seg => ({ to });

const head = (e: Edge, s: Side) => `M${at(e.from, s)}`;
const fwd = (e: Edge, s: Side) =>
  e.segs.map((g) => (g.c1 ? `C${at(g.c1, s)} ${at(g.c2, s)} ${at(g.to, s)}` : `L${at(g.to, s)}`)).join("");
/** The same edge walked backwards — control points swapped, points shifted one
 *  along. Strips are built from one authored edge and its own reverse, so the
 *  two sides of a surface can never disagree. */
function rev(e: Edge, s: Side): string {
  const pts = [e.from, ...e.segs.map((g) => g.to)];
  let d = "";
  for (let i = e.segs.length - 1; i >= 0; i--) {
    const g = e.segs[i];
    d += g.c1 ? `C${at(g.c2, s)} ${at(g.c1, s)} ${at(pts[i], s)}` : `L${at(pts[i], s)}`;
  }
  return d;
}
const last = (e: Edge) => e.segs[e.segs.length - 1].to;
const open = (e: Edge, s: Side) => head(e, s) + fwd(e, s);
/** The sheet metal between one edge on the far side and the same edge on the
 *  near side: the front face, the bonnet, the roof, the backlight. */
const strip = (e: Edge) => open(e, -1) + `L${at(last(e), 1)}` + rev(e, 1) + "Z";
/** A transverse edge: the same profile point on both sides of the car. */
const across = (p: Pt) => `M${at(p, 1)}L${at(p, -1)}`;

// ── the car, as a side profile that carries its own half-width ──────────────
const BUMPER_F: Pt = [90, 330, 745];
const NOSE_T: Pt = [30, 790, 775];
const COWL: Pt = [1560, 1015, 860];
const HEADER: Pt = [2520, 1420, 705];
const ROOF_E: Pt = [3020, MM.height - 1, 700];
const LIP: Pt = [4150, 1105, 780];
const TAIL_T: Pt = [MM.length, 1012, 758];

/** The front face: bumper bottom up and over the nose. */
const FACE: Edge = { from: BUMPER_F, segs: [cv([30, 430, 750], [0, 570, 760], NOSE_T)] };
/** The bonnet/wing crease, forward of the windscreen. */
const BONNET: Edge = {
  from: NOSE_T,
  segs: [cv([200, 848, 830], [430, 888, 878], [900, 925, 900]), cv([1250, 968, 905], [1440, 998, 890], COWL)],
};
/** The beltline. Also the base of the glasshouse — one line, drawn once. */
const SHOULDER: Edge = { from: COWL, segs: [cv([2100, 1052, 905], [3200, 1092, 895], LIP)] };
const DECK: Edge = { from: LIP, segs: [cv([4340, 1108, 775], [4570, 1074, 768], TAIL_T)] };
/** Tail, rear bumper, both arches and the sill: the whole lower silhouette.
 *  Straight between the arches, or the car is a capsule whatever the ratio. */
const UNDER: Edge = {
  from: TAIL_T,
  segs: [
    cv([4706, 860, 770], [4700, 660, 790], [4676, 540, 800]),
    cv([4660, 420, 800], [4570, 366, 840], [4400, 355, 880]),
    ln([4130, 362, HALF]),
    cv([4120, 640, HALF], [3990, 752, HALF], [AXLE_R, 756, HALF]),
    cv([3442, 752, HALF], [3320, 640, HALF], [3315, 372, HALF]),
    ln([1240, 372, HALF]),
    cv([1235, 640, HALF], [1105, 752, HALF], [AXLE_F, 756, HALF]),
    cv([577, 752, HALF], [450, 640, HALF], [445, 368, HALF]),
    cv([300, 350, 870], [170, 336, 800], BUMPER_F),
  ],
};

// The glasshouse, in three panes, because one blob reads as a lid. Each pane is
// a strip between the far and near copies of one edge; the fourth side of the
// closed glasshouse is SHOULDER, walked backwards.
const WSCREEN: Edge = { from: COWL, segs: [cv([1830, 1120, 828], [2240, 1292, 752], HEADER)] };
const ROOF: Edge = { from: HEADER, segs: [cv([2690, MM.height + 1, 700], [2960, MM.height + 6, 700], ROOF_E)] };
const BACKLIGHT: Edge = { from: ROOF_E, segs: [cv([3420, 1400, 704], [3820, 1256, 740], LIP)] };

const BODY_FILL =
  open(FACE, 1) + fwd(BONNET, 1) + fwd(SHOULDER, 1) + fwd(DECK, 1) + fwd(UNDER, 1) + "Z";
const GLASS_FILL = (s: Side) =>
  open(WSCREEN, s) + fwd(ROOF, s) + fwd(BACKLIGHT, s) + rev(SHOULDER, s) + "Z";
/** The near glasshouse's upper edge in one stroke: A-pillar, roof rail, C-pillar. */
const GLASS_EDGE = (s: Side) => open(WSCREEN, s) + fwd(ROOF, s) + fwd(BACKLIGHT, s);

// ── doors ───────────────────────────────────────────────────────────────────
/** A vertical axis to swing a panel about: at station hx, on the body side. */
interface Hinge {
  readonly hx: number;
  readonly hw: number;
}
interface DoorSpec extends Hinge {
  /** sill front, sill rear, belt rear, glass rear, glass front, belt front. */
  readonly pts: readonly [Pt, Pt, Pt, Pt, Pt, Pt];
}
const DOOR_F: DoorSpec = {
  hx: 1690,
  hw: 900,
  pts: [
    [1690, Z_SILL, HALF],
    [2640, Z_SILL, HALF],
    [2640, Z_BELT, 918],
    [2640, 1412, 722],
    [1838, 1128, 812],
    [1690, Z_BELT, 918],
  ],
};
const DOOR_R: DoorSpec = {
  hx: 2640,
  hw: 900,
  pts: [
    [2640, Z_SILL, HALF],
    [3330, Z_SILL, HALF],
    [3330, Z_BELT, 918],
    [3330, 1396, 730],
    [2668, 1418, 716],
    [2640, Z_BELT, 918],
  ],
};
const SWING_DEG = 62;
// The far side swings further, and not for realism. Only the part of a far door
// outboard of the far roof rail is visible at all, and at 62° that part is a
// narrow triangle at the door's top corner — a spike that reads as an aerial,
// not as a door. Past ~78° enough of the panel clears the rail to arrive as an
// area. Both doors on a real car open the same amount; this drawing is a
// readout, and a readout that cannot be read is wrong in the way that matters.
const FAR_SWING_DEG = 80;

// The bonnet is hinged at the cowl, so it turns AWAY from a viewer standing in
// front of it and passes edge-on at 44°. 70° is only 26° past that — enough to
// prove it is open and not enough to be a shape, which is why it arrived as a
// splinter laid over the roof. At 96° it is past vertical and what you see is
// its underside, which is also what you see walking up to a car with the frunk
// raised.
const FRUNK_DEG = 96;

/** A point on a door, after the door has swung about its hinge. */
function swung(p: Pt, s: Side, d: Hinge, deg: number, drop = 0): string {
  const a = (s * deg * Math.PI) / 180;
  const hy = s * d.hw;
  const dx = p[0] - d.hx;
  const dy = s * p[2] - hy;
  return q(d.hx + dx * Math.cos(a) - dy * Math.sin(a), hy + dx * Math.sin(a) + dy * Math.cos(a), p[1] - drop);
}
const doorPath = (d: DoorSpec, s: Side, deg: number) =>
  `M${d.pts.map((p) => swung(p, s, d, deg)).join("L")}Z`;
/** The gap the glass leaves when it drops: aperture top edge, then glass top
 *  edge. Shut, the two edges coincide and it degenerates to the line the top
 *  of the glass really is — which is why one element can be both. Drawn as an
 *  area because a lone amber line inside the glasshouse reads as a stick
 *  floating in the cabin rather than as a window that is down. */
const ventPath = (d: DoorSpec, s: Side, deg: number, drop: number) =>
  `M${swung(d.pts[3], s, d, deg)}L${swung(d.pts[4], s, d, deg)}` +
  `L${swung(d.pts[4], s, d, deg, drop)}L${swung(d.pts[3], s, d, deg, drop)}Z`;
/** The aperture's top edge alone — the far side's door line. */
const railPath = (d: DoorSpec, s: Side, deg: number) =>
  `M${swung(d.pts[3], s, d, deg)}L${swung(d.pts[4], s, d, deg)}`;

// ── lids ────────────────────────────────────────────────────────────────────
/** A point on a lid, after the lid has hinged about a lateral axis. Positive
 *  degrees lift the front (bonnet), negative the rear (boot). */
function tilt(p: Q3, hx: number, hz: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const dx = p[0] - hx;
  const dz = p[2] - hz;
  return q(hx + dx * Math.cos(a) + dz * Math.sin(a), p[1], hz - dx * Math.sin(a) + dz * Math.cos(a));
}
// The panel edges ARE the creases they sit in — a bonnet shutline runs along
// the top of the wing, and drawing both put two parallel lines the length of
// the nose, which is what made the front read as folded card rather than as a
// car. One line, and it carries the state.
const BONNET_LID: readonly Q3[] = [
  [1560, 860, 1015],
  [900, 898, 925],
  [30, 775, 790],
  [30, -775, 790],
  [900, -898, 925],
  [1560, -860, 1015],
];
const BOOT_LID: readonly Q3[] = [
  [4150, 780, 1105],
  [4694, 758, 1012],
  [4694, -758, 1012],
  [4150, -780, 1105],
];
const lidPath = (pts: readonly Q3[], hx: number, hz: number, deg: number) =>
  `M${pts.map((p) => tilt(p, hx, hz, deg)).join("L")}Z`;

// ── charge port: rear left, on the near quarter ─────────────────────────────
const PORT: readonly [Pt, Pt, Pt, Pt] = [
  [4200, 752, 898],
  [4420, 752, 884],
  [4420, 942, 884],
  [4200, 942, 898],
];
const PORT_HINGE: Hinge = { hx: 4200, hw: 890 };
const portPath = (deg: number) => `M${PORT.map((p) => swung(p, 1, PORT_HINGE, deg)).join("L")}Z`;

// ── wheels: a circle in a vertical plane is an exact ellipse here ───────────
const K = 0.5523;
function wheel(x: number, r: number, s: Side): string {
  const c = [OX + U * (KX * x + KY * s * WHEEL_Y), OY + U * (JY * s * WHEEL_Y - JX * x - JZ * r)];
  // The projections of the two radii — rearward and up — are the ellipse's
  // conjugate semi-diameters, which is all four Béziers need.
  const a = [U * KX * r, -U * JX * r];
  const b = [0, -U * JZ * r];
  const pt = (mx: number, my: number) => `${n(c[0] + mx * a[0] + my * b[0])} ${n(c[1] + mx * a[1] + my * b[1])}`;
  return (
    `M${pt(1, 0)}` +
    `C${pt(1, K)} ${pt(K, 1)} ${pt(0, 1)}` +
    `C${pt(-K, 1)} ${pt(-1, K)} ${pt(-1, 0)}` +
    `C${pt(-1, -K)} ${pt(-K, -1)} ${pt(0, -1)}` +
    `C${pt(K, -1)} ${pt(1, -K)} ${pt(1, 0)}Z`
  );
}

const OPEN = "var(--chart-3)"; // amber — open, and usually should not be
const LIVE = "var(--chart-2)"; // green — running on purpose
const IDLE = "oklch(0.97 0 0 / 30%)";
const BODY = "oklch(0.97 0 0 / 62%)";
const PANEL = "oklch(0.97 0 0 / 34%)";
const DETAIL = "oklch(0.97 0 0 / 20%)";
const UNKNOWN = "oklch(0.97 0 0 / 10%)";
/** Surfaces are opaque so that what is behind them is hidden. The diagram sits
 *  directly on the /v2 screen, so the page's own ground is the right ink. */
const BG = "var(--background)";

// The three weights. Anything drawn outside them is a mistake.
const T1 = 2.4; // silhouette
const T2 = 1.4; // shutlines, glass edges, wheels, mirrors
const T3 = 0.8; // surface detail: creases, lamps, apertures
/** The one weight outside the hierarchy, and it is the reason for the
 *  hierarchy: state outranks structure, so anything that is OPEN is drawn
 *  heavier than the shutline it just left. */
const T_OPEN = 2.6;

/** null means the car has not said. Never drawn as "closed". */
type Tri = boolean | null;

function strokeFor(open: Tri): string {
  if (open === true) return OPEN;
  if (open === false) return IDLE;
  return UNKNOWN;
}

const MOVE = "d 280ms cubic-bezier(.22,1,.36,1), stroke 200ms ease, stroke-width 200ms ease";

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

  // The whole silhouette carries the lock: the only state with a consequence
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
        // Wider than the car: a near door swings ~30 units past the flank, a far
        // door ~36 units past the far roof rail, and an SVG clips at its
        // viewBox — so on the one state that most needs to be legible, "you
        // left a door open", the line was cut off at the edge.
        viewBox="0 0 258 150"
        role="img"
        aria-label={summary || t("car_state_unknown")}
        className="v2-car"
        style={{ width: "min(100%, 300px)", height: "auto" }}
      >
        {/* Far side first, before anything opaque: what the body hides, the
            body hides. What is left over is the sliver that is really there. */}
        <FarDoor d={DOOR_F} open={doors?.frontRight ?? null} />
        <FarDoor d={DOOR_R} open={doors?.rearRight ?? null} />

        {/* Surfaces: closed, silent, opaque. Every one of them is the sheet
            metal between the far and near copies of a single authored edge. */}
        {[FACE, BONNET, SHOULDER, DECK, WSCREEN, ROOF, BACKLIGHT].map((e, i) => (
          <path key={i} d={strip(e)} fill={BG} />
        ))}
        <path d={wheel(AXLE_F, WHEEL_R, 1)} fill={BG} stroke={DETAIL} strokeWidth={T2} />
        <path d={wheel(AXLE_R, WHEEL_R, 1)} fill={BG} stroke={DETAIL} strokeWidth={T2} />
        <path d={wheel(AXLE_F, WHEEL_R * 0.56, 1)} fill="none" stroke={DETAIL} strokeWidth={T3} />
        <path d={wheel(AXLE_R, WHEEL_R * 0.56, 1)} fill="none" stroke={DETAIL} strokeWidth={T3} />
        <path d={BODY_FILL} fill={BG} />
        <path d={GLASS_FILL(1)} fill={BG} />

        {/* Climate: the panes tint and breathe. Stroke-less overlays, because
            v2-breathe animates opacity and would take an outline with it. */}
        {glassFill > 0 && (
          <g className="v2-breathe" style={{ transition: "opacity 220ms ease" }}>
            <path d={strip(WSCREEN)} fill={LIVE} fillOpacity={glassFill} />
            <path d={strip(BACKLIGHT)} fill={LIVE} fillOpacity={glassFill} />
            <path d={GLASS_FILL(1)} fill={LIVE} fillOpacity={glassFill} />
          </g>
        )}

        {/* The silhouette, and only the silhouette. Not "the near outline":
            half of that is interior. Going round — the near underside, across
            the front bumper, up the far face and bonnet, over the far
            glasshouse, down the far deck, across the tail. */}
        <g
          fill="none"
          stroke={bodyStroke}
          strokeWidth={T1}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="v2-draw"
          style={{ transition: "stroke 200ms ease" }}
        >
          {/* pathLength normalises each one to the single stroke-dasharray in
              globals.css. Without it the short edges sit inside the gap for
              most of the draw-in and then pop, because one dash length cannot
              fit six paths of six different lengths. */}
          {[
            open(UNDER, 1),
            across(BUMPER_F),
            open(FACE, -1) + fwd(BONNET, -1),
            GLASS_EDGE(-1),
            open(DECK, -1),
            across(TAIL_T),
          ].map((d, i) => (
            <path key={i} d={d} pathLength={1200} />
          ))}
        </g>

        {/* Interior edges: real gaps in the sheet metal, and the creases where
            one surface turns into another. */}
        <g fill="none" stroke={PANEL} strokeWidth={T2} strokeLinejoin="round" strokeLinecap="round">
          <path d={GLASS_EDGE(1)} />
          <path d={open(SHOULDER, 1)} />
          <path d={across(COWL)} />
          <path d={across(HEADER)} />
          <path d={across(ROOF_E)} />
        </g>

        {/* The apertures stay when the panels swing: they are the hole, not the
            door. Faint, so that four unknown doors still leave a car. */}
        <g fill="none" stroke={DETAIL} strokeWidth={T3} strokeLinejoin="round" strokeLinecap="round">
          <path d={doorPath(DOOR_F, 1, 0)} />
          <path d={doorPath(DOOR_R, 1, 0)} />
          <path d={railPath(DOOR_F, -1, 0)} />
          <path d={railPath(DOOR_R, -1, 0)} />
          <path d={lidPath(BONNET_LID, 0, 0, 0)} />
          <path d={lidPath(BOOT_LID, 0, 0, 0)} />
          <Lamps />
        </g>

        {/* Lids: the panel itself hinges in space, so it stays the shape it is
            when shut and cannot cross the body line. */}
        <Lid d={lidPath(BONNET_LID, 1560, 1015, frunk === true ? FRUNK_DEG : 0)} open={frunk} />
        <Lid d={lidPath(BOOT_LID, 4230, 1158, trunk === true ? -34 : 0)} open={trunk} />

        <Mirror />

        {/* Charge port — rear left, which is why the near side is the left one.
            Green and pulsing only while power is actually flowing, amber when
            it is standing open on a car that is not charging. */}
        <path
          d={portPath(port === true ? 62 : 0)}
          fill="none"
          stroke={charging ? LIVE : strokeFor(port)}
          strokeWidth={port === true || charging ? T_OPEN : T2}
          strokeLinejoin="round"
          className={charging ? "v2-pulse" : undefined}
          style={{ transition: MOVE }}
        />

        <NearDoor d={DOOR_F} open={doors?.frontLeft ?? null} vent={windows?.frontLeft ?? null} />
        <NearDoor d={DOOR_R} open={doors?.rearLeft ?? null} vent={windows?.rearLeft ?? null} />

        {/* The far side's only voice. Its door's top edge and its glass's top
            edge both live on the far roof rail — the one far-side line the eye
            can reach from here — and both swing out past it when the door
            opens. */}
        <FarRail d={DOOR_F} open={doors?.frontRight ?? null} vent={windows?.frontRight ?? null} />
        <FarRail d={DOOR_R} open={doors?.rearRight ?? null} vent={windows?.rearRight ?? null} />

        {/* Sentry sits at the windscreen, because that is where it watches
            from. A ring rather than a camera glyph: at this size a glyph is
            four grey pixels. */}
        {sentry === true && (
          <circle
            cx={n(qx(2050, 0))}
            cy={n(qy(2050, 0, 1215))}
            r={5}
            fill="none"
            stroke={LIVE}
            strokeWidth={T_OPEN}
            className="v2-pulse"
          />
        )}
      </svg>
    </div>
  );
}

function anyOpen(group: DoorsState | WindowsState | null): boolean {
  return group != null && Object.values(group).some(Boolean);
}

function Vent({ d, side, deg, vent }: { d: DoorSpec; side: Side; deg: number; vent: Tri }) {
  return (
    <path
      d={ventPath(d, side, deg, vent === true ? VENT : 0)}
      fill={OPEN}
      fillOpacity={vent === true ? 0.3 : 0}
      stroke={strokeFor(vent)}
      strokeWidth={vent === true ? T_OPEN : T2}
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{ transition: MOVE + ", fill-opacity 200ms ease" }}
    />
  );
}

function NearDoor({ d, open, vent }: { d: DoorSpec; open: Tri; vent: Tri }) {
  const deg = open === true ? SWING_DEG : 0;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path
        d={doorPath(d, 1, deg)}
        fill={OPEN}
        fillOpacity={open === true ? 0.14 : 0}
        stroke={strokeFor(open)}
        strokeWidth={open === true ? T_OPEN : T2}
        style={{ transition: MOVE + ", fill-opacity 200ms ease" }}
      />
      <Vent d={d} side={1} deg={deg} vent={vent} />
    </g>
  );
}

/** The whole far panel, drawn before the body so the body can hide it. Only
 *  what is genuinely outboard of the far roof rail survives — and it survives
 *  as an area, because at this size a hairline sliver reads as a scratch. */
function FarDoor({ d, open }: { d: DoorSpec; open: Tri }) {
  if (open !== true) return null;
  return (
    <path
      d={doorPath(d, -1, FAR_SWING_DEG)}
      fill={OPEN}
      fillOpacity={0.28}
      stroke={OPEN}
      strokeWidth={T_OPEN}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

/** The far side's two top edges, drawn last so they are never occluded: a far
 *  door and a far window have to be legible even when they are shut. */
function FarRail({ d, open, vent }: { d: DoorSpec; open: Tri; vent: Tri }) {
  const deg = open === true ? FAR_SWING_DEG : 0;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path
        d={railPath(d, -1, deg)}
        fill="none"
        stroke={strokeFor(open)}
        strokeWidth={open === true ? T_OPEN : T2}
        style={{ transition: MOVE }}
      />
      <Vent d={d} side={-1} deg={deg} vent={vent} />
    </g>
  );
}

function Lid({ d, open }: { d: string; open: Tri }) {
  return (
    <path
      d={d}
      fill={OPEN}
      fillOpacity={open === true ? 0.16 : 0}
      stroke={strokeFor(open)}
      strokeWidth={open === true ? T_OPEN : T2}
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{ transition: MOVE + ", fill-opacity 200ms ease" }}
    />
  );
}

// Two of the three things that say which end is the front; the mirrors are the
// third. Held inboard of the front tyre: swept out into it, the join reads as a
// broken line rather than as either part.
function Lamps() {
  return (
    <>
      {([1, -1] as const).map((s) => (
        <path
          key={s}
          d={
            `M${q(120, s * 636, 728)} C${q(262, s * 750, 764)} ${q(360, s * 812, 780)} ${q(424, s * 842, 786)}` +
            `L${q(412, s * 818, 730)} C${q(340, s * 786, 722)} ${q(250, s * 722, 700)} ${q(142, s * 596, 668)}Z`
          }
        />
      ))}
      <path d={`M${q(178, 686, 452)} C${q(44, 420, 486)} ${q(44, -420, 486)} ${q(178, -686, 452)}`} />
      <path d={`M${q(4676, 792, 986)} C${q(4560, 862, 1000)} ${q(4470, 886, 1004)} ${q(4400, 894, 1006)}`} />
    </>
  );
}

/** Structure that appears twice, so a tier lighter than structure that appears
 *  once — but kept, because a mirror is the cheapest way to say "front". */
/** Near side only. The far mirror really is visible from here — it stands over
 *  the far side of the bonnet — but at 300px it read as a hatch cut into the
 *  bonnet, and a detail that reads as a different object is worse than no
 *  detail at all. */
function Mirror() {
  const y = (v: number) => v;
  return (
    <g fill="none" stroke={IDLE} strokeWidth={T2} strokeLinejoin="round" strokeLinecap="round">
      <path d={`M${q(1706, y(906), 1010)}L${q(1806, y(1010), 1024)}`} />
      <path
        d={`M${q(1786, y(1002), 992)}L${q(1918, y(1046), 1016)}L${q(1946, y(1046), 1078)}L${q(1812, y(1002), 1058)}Z`}
      />
    </g>
  );
}
