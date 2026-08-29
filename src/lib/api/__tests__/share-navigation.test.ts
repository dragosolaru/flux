import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sending a destination must not touch the climate.
 *
 * `shareNavigation` used to fire `precondition_max` alongside the destination
 * for third-party fast chargers, on the belief that it warmed the battery for
 * charging. It does not: `set_preconditioning_max` toggles **Max Defrost**, a
 * cabin command. The proof came from the car — tapping "send to car" at 27°C
 * set the destination and started DEFROSTING HI MAX, heating the cabin and
 * draining the battery unasked.
 *
 * There is no Fleet API command that preconditions the battery. Tesla does it
 * itself when navigating to a Supercharger; for anything else there is nothing
 * to send, and claiming otherwise was worse than doing nothing because the
 * toast said the battery was being warmed while the car defrosted a windscreen.
 *
 * This is a source check rather than a behavioural one on purpose: the defect
 * was not a wrong value, it was an extra command fired from three places at
 * once. What has to stay true is that no navigation path reaches a climate
 * command, and that is a property of the call sites, not of a return value.
 */
const SRC = join(process.cwd(), "src");

const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const NAVIGATION_PATHS = [
  "lib/api/vehicles.ts",
  "components/charging-map/ChargerDetailSheet.tsx",
];

describe("share navigation", () => {
  it.each(NAVIGATION_PATHS)("%s sends no climate command", (rel) => {
    expect(read(rel)).not.toContain('"precondition_max"');
  });

  it("shareNavigation takes no preconditioning option at all", () => {
    // Not merely defaulted to false — absent, so no caller can pass it back in.
    const src = read("lib/api/vehicles.ts");
    const start = src.indexOf("export async function shareNavigation");
    const body = src.slice(start, src.indexOf("\n}", start));
    expect(body).not.toContain("precondition");
  });

  it("keeps the one deliberate max-defrost path, on the trip map", () => {
    // A driver may genuinely want it before a cold charger. It stays a button
    // someone presses, labelled as what it does, and never a side effect.
    const map = read("app/(dashboard)/map/map-client.tsx");
    expect(map).toContain('sendCommand(teslaVehicle.id, "precondition_max"');
    expect(map).toContain("handleManualPrecondition");
  });

  it("no longer claims a battery is being warmed", () => {
    const ro = JSON.parse(read("lib/i18n/locales/ro.json")) as {
      trip: Record<string, string>;
      chargingMap: Record<string, string>;
    };
    expect(ro.trip.share_success_preconditioned).toBeUndefined();
    expect(ro.chargingMap.send_to_car_preconditioned).toBeUndefined();
    expect(ro.trip.precondition_started).not.toContain("baterie");
  });
});
