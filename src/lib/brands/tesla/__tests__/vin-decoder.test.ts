import { describe, expect, it } from "vitest";

import { decodeTeslaVin } from "../vin-decoder";

/**
 * Tesla builds in four places and this decoder accepted one of them.
 *
 * `5YJ` is Fremont. `LRW` is Shanghai and `XP7` is Berlin — between them, every
 * European and Chinese car, which is to say every car this app has actually
 * been pointed at. The owner's own Model 3 (`LRW3E7EL0PC661169`) decoded to
 * null, silently, for as long as the decoder has existed.
 */
describe("decodeTeslaVin", () => {
  it("accepts a Shanghai-built car", () => {
    const info = decodeTeslaVin("LRW3E7EL0PC661169");
    expect(info?.model).toBe("Model 3");
    expect(info?.year).toBe(2023);
  });

  it("still accepts Fremont", () => {
    expect(decodeTeslaVin("5YJ3E1EA7KF000001")?.model).toBe("Model 3");
  });

  it("accepts Berlin", () => {
    expect(decodeTeslaVin("XP7YGCEK9PB000001")?.model).toBe("Model Y");
  });

  it("refuses something that is not a Tesla VIN", () => {
    expect(decodeTeslaVin("WVWZZZ1JZXW000001")).toBeNull();
    expect(decodeTeslaVin("LRW3E7EL0PC66116")).toBeNull(); // 16 characters
  });

  it("does not pretend to know the trim", () => {
    // This position is the body/platform, not the drivetrain: a Performance and
    // a Standard Range can share it. The real trim comes from the car's own
    // vehicle_config.trim_badging, which is why nothing derives a battery
    // baseline from this field any more.
    expect(decodeTeslaVin("LRW3E7EL0PC661169")?.variant).toBeDefined();
  });
});
