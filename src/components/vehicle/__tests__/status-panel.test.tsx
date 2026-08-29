import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { StatusPanel } = await import("../StatusPanel");
import type { VehicleState } from "@/types/vehicle";

/**
 * The panel that replaced the car drawing.
 *
 * Two of these pin defects this component's ancestry produced repeatedly: a
 * state invented for a car that never reported one, and a diagram shown with
 * nothing on it to show. Both were invisible in the source.
 */
const shut = {
  doorsOpen: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
  windowsOpen: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
  isFrunkOpen: false,
  isTrunkOpen: false,
  isChargePortOpen: false,
  chargingState: "disconnected",
} as unknown as VehicleState;

const render = (state: VehicleState | undefined) =>
  renderToStaticMarkup(<StatusPanel state={state} />);

/** The schematic is the only <svg> the panel ever renders. */
const hasFootprint = (html: string) => html.includes("<svg");

describe("StatusPanel", () => {
  it("shows chips and no schematic when everything is shut", () => {
    const html = render(shut);
    expect(html).toContain("chip_doors");
    expect(hasFootprint(html)).toBe(false);
  });

  it("summons the schematic for a door, and says which", () => {
    const html = render({
      ...shut,
      doorsOpen: { frontLeft: true, frontRight: false, rearLeft: false, rearRight: false },
    } as VehicleState);
    expect(hasFootprint(html)).toBe(true);
    // The open mark is filled amber; a shut one is the flat white wash.
    expect(html).toContain("var(--chart-3)");
  });

  it("does NOT summon the schematic for an open window", () => {
    // Windows are deliberately not on the schematic — eight marks is too many.
    // Left as "anything open", a window drew a diagram with nothing lit on it,
    // which is worse than no diagram.
    const html = render({
      ...shut,
      windowsOpen: { frontLeft: true, frontRight: false, rearLeft: false, rearRight: false },
    } as VehicleState);
    expect(hasFootprint(html)).toBe(false);
  });

  it("counts, rather than repeating the label", () => {
    const html = render({
      ...shut,
      doorsOpen: { frontLeft: true, frontRight: true, rearLeft: false, rearRight: false },
    } as VehicleState);
    expect(html).toContain("2 chip_doors");
  });

  it("never draws an unreported field as shut", () => {
    const html = render({
      ...shut,
      doorsOpen: null,
      windowsOpen: null,
      isFrunkOpen: null,
      isTrunkOpen: null,
      isChargePortOpen: null,
    } as unknown as VehicleState);
    expect(html).toContain("dotted");
    expect(html).not.toContain("var(--chart-3)");
    expect(hasFootprint(html)).toBe(false);
  });

  it("survives having no reading at all", () => {
    const html = render(undefined);
    expect(html).toContain("nothing_open");
    expect(hasFootprint(html)).toBe(false);
  });

  it("shows the port green while charging, not amber", () => {
    const html = render({
      ...shut,
      isChargePortOpen: true,
      chargingState: "charging",
    } as VehicleState);
    expect(html).toContain("var(--chart-2)");
  });
});
