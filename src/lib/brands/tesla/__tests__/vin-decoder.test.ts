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

  it("reads position 5 as the body it is, not as a trim", () => {
    // The owner's car is a Model 3 Performance and position 5 is `E`, which the
    // old map called "Standard Range RWD" — so the add-a-vehicle screen
    // introduced a Performance to its owner as a Standard Range. `E` means a
    // four-door saloon and nothing about the drivetrain.
    const info = decodeTeslaVin("LRW3E7EL0PC661169");
    expect(info?.body).toContain("Sedan");
    expect(info).not.toHaveProperty("variant");
  });
});
