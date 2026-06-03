import { describe, it, expect } from "vitest";

import { rowToCharger } from "../query";

describe("rowToCharger", () => {
  it("maps a fully-populated RPC row into a Charger", () => {
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      lat: 44.4268,
      lng: 26.1025,
      name: "Ionity Bucharest",
      operator: "IONITY",
      operator_id: "ionity",
      country: "RO",
      address: {
        street: "Bd. Unirii 1",
        city: "Bucharest",
        region: "Bucuresti",
        country: "RO",
        postcode: "030167",
      },
      max_power_kw: 350,
      pricing: { perKwh: 0.69, currency: "EUR", source: "chargeprice" },
      availability: "unknown",
      confidence: 0.9,
      last_seen_at: "2026-06-03T10:00:00.000Z",
      connectors: [
        { type: "ccs2", powerKw: 350, count: 4 },
        { type: "chademo", powerKw: 50, count: 1 },
      ],
      sources: [
        { source: "ocm", ref: "12345" },
        { source: "osm", ref: "node/678" },
      ],
    };

    const charger = rowToCharger(row);

    expect(charger.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(charger.lat).toBe(44.4268);
    expect(charger.lng).toBe(26.1025);
    expect(charger.name).toBe("Ionity Bucharest");
    expect(charger.operator).toBe("IONITY");
    expect(charger.operatorId).toBe("ionity");
    expect(charger.address).toEqual({
      street: "Bd. Unirii 1",
      city: "Bucharest",
      region: "Bucuresti",
      country: "RO",
      postcode: "030167",
    });
    expect(charger.maxPowerKw).toBe(350);
    expect(charger.confidence).toBe(0.9);
    expect(charger.availability).toBe("unknown");
    expect(charger.lastSeenAt).toBe("2026-06-03T10:00:00.000Z");
  });

  it("types connectors and defaults count to 1", () => {
    const charger = rowToCharger({
      connectors: [
        { type: "ccs2", powerKw: 150, count: 2 },
        { type: "unknown-socket", powerKw: null },
      ],
    });

    expect(charger.connectors).toEqual([
      { type: "ccs2", powerKw: 150, count: 2 },
      { type: "other", powerKw: null, count: 1 },
    ]);
  });

  it("keeps only well-formed, known sources", () => {
    const charger = rowToCharger({
      sources: [
        { source: "ocm", ref: "1" },
        { source: "bogus", ref: "2" },
        { source: "osm" },
        { ref: "3" },
      ],
    });

    expect(charger.sources).toEqual([{ source: "ocm", ref: "1" }]);
  });

  it("returns null pricing when the jsonb is null or incomplete", () => {
    expect(rowToCharger({ pricing: null }).pricing).toBeNull();
    expect(rowToCharger({ pricing: { perKwh: 0.5 } }).pricing).toBeNull();
    expect(rowToCharger({}).pricing).toBeNull();
  });

  it("keeps complete pricing", () => {
    expect(
      rowToCharger({ pricing: { perKwh: 0.42, currency: "RON", source: "chargeprice" } }).pricing,
    ).toEqual({ perKwh: 0.42, currency: "RON", source: "chargeprice" });
  });

  it("falls back safely on empty / malformed rows", () => {
    const charger = rowToCharger(undefined);
    expect(charger.id).toBe("");
    expect(charger.lat).toBe(0);
    expect(charger.lng).toBe(0);
    expect(charger.name).toBeNull();
    expect(charger.operator).toBeNull();
    expect(charger.operatorId).toBeNull();
    expect(charger.connectors).toEqual([]);
    expect(charger.sources).toEqual([]);
    expect(charger.pricing).toBeNull();
    expect(charger.maxPowerKw).toBeNull();
    expect(charger.confidence).toBe(0);
    expect(charger.availability).toBe("unknown");
    expect(charger.address).toEqual({
      street: null,
      city: null,
      region: null,
      country: null,
      postcode: null,
    });
  });

  it("nulls non-finite / wrong-typed numeric fields", () => {
    const charger = rowToCharger({ lat: "44.4", max_power_kw: "fast", confidence: null });
    expect(charger.lat).toBe(0);
    expect(charger.maxPowerKw).toBeNull();
    expect(charger.confidence).toBe(0);
  });
});
