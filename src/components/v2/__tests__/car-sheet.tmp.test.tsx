import { writeFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, vi } from "vitest";

import type { DoorsState, VehicleState, WindowsState } from "@/types/vehicle";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { CarDiagram } = await import("../car-diagram");

const NO: DoorsState = { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false };
const ALL: DoorsState = { frontLeft: true, frontRight: true, rearLeft: true, rearRight: true };

function st(p: Partial<VehicleState>): VehicleState {
  return {
    doorsOpen: NO,
    windowsOpen: NO as WindowsState,
    isLocked: true,
    isClimateOn: false,
    chargingState: "disconnected",
    isSentryMode: false,
    isFrunkOpen: false,
    isTrunkOpen: false,
    isChargePortOpen: false,
    ...p,
  } as VehicleState;
}

const NULLS = st({
  doorsOpen: null,
  windowsOpen: null,
  isLocked: null,
  isClimateOn: null,
  chargingState: null,
  isSentryMode: null,
  isFrunkOpen: null,
  isTrunkOpen: null,
  isChargePortOpen: null,
} as Partial<VehicleState>);

const CASES: readonly (readonly [string, VehicleState | undefined])[] = [
  ["all closed", st({})],
  ["door FL", st({ doorsOpen: { ...NO, frontLeft: true } })],
  ["door RL", st({ doorsOpen: { ...NO, rearLeft: true } })],
  ["door FR (far)", st({ doorsOpen: { ...NO, frontRight: true } })],
  ["door RR (far)", st({ doorsOpen: { ...NO, rearRight: true } })],
  ["all four doors", st({ doorsOpen: ALL })],
  ["windows near", st({ windowsOpen: { ...NO, frontLeft: true, rearLeft: true } })],
  ["all windows", st({ windowsOpen: ALL })],
  ["frunk", st({ isFrunkOpen: true })],
  ["boot", st({ isTrunkOpen: true })],
  ["port open, parked", st({ isChargePortOpen: true })],
  ["port open, charging", st({ isChargePortOpen: true, chargingState: "charging" })],
  ["unlocked", st({ isLocked: false })],
  ["climate on", st({ isClimateOn: true })],
  ["sentry", st({ isSentryMode: true })],
  [
    "everything at once",
    st({
      doorsOpen: ALL,
      windowsOpen: ALL,
      isLocked: false,
      isClimateOn: true,
      chargingState: "charging",
      isSentryMode: true,
      isFrunkOpen: true,
      isTrunkOpen: true,
      isChargePortOpen: true,
    }),
  ],
  ["every field null", NULLS],
  ["state undefined", undefined],
];

const CSS = `
:root {
  --chart-2: oklch(0.72 0.17 155);
  --chart-3: oklch(0.80 0.17 75);
  --background: oklch(0.08 0.01 240);
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px;
  background: oklch(0.08 0.01 240);
  color: oklch(0.97 0 0);
  font: 11px ui-sans-serif, system-ui, sans-serif;
}
h2 { font-size: 12px; font-weight: 500; opacity: .5; margin: 28px 0 10px; letter-spacing: .08em; text-transform: uppercase; }
.grid { display: flex; flex-wrap: wrap; gap: 14px; }
.cell { }
.cap { opacity: .45; margin-bottom: 4px; }
.s208 svg { width: 208px !important; }
.s600 svg { width: 600px !important; }
.s104 svg { width: 104px !important; }
`;

describe("car sheet", () => {
  it("writes a contact sheet", () => {
    const out = process.env.CAR_SHEET_OUT;
    if (!out) return;

    const cell = (label: string, state: VehicleState | undefined, size: string) =>
      `<div class="cell ${size}"><div class="cap">${label}</div>${renderToStaticMarkup(
        <CarDiagram state={state} />,
      )}</div>`;

    const html =
      `<!doctype html><meta charset="utf-8"><style>${CSS}</style>` +
      `<h2>208px — the phone size. does the shading survive?</h2>` +
      `<div class="grid">${CASES.map(([l, s]) => cell(l, s, "s208")).join("")}</div>` +
      `<h2>104px — half again, sanity only</h2>` +
      `<div class="grid">${CASES.slice(0, 6)
        .map(([l, s]) => cell(l, s, "s104"))
        .join("")}</div>` +
      `<h2>600px — is it beautiful?</h2>` +
      `<div class="grid">${CASES.map(([l, s]) => cell(l, s, "s600")).join("")}</div>`;

    writeFileSync(out, html);
  });
});
