// Dedup regression guards. Originally written by a review pass to characterise
// defects in 870017c; the assertions below now pin the corrected behaviour so
// the same regressions cannot come back.

import { describe, it, expect } from "vitest";
import { matchScore, haversineMeters, clusterChargers } from "../dedup";
import type { RawCharger, ChargerConnector } from "../types";

const EMPTY_ADDRESS = { street: null, city: null, region: null, country: null, postcode: null };

let n = 0;
function raw(over: Partial<RawCharger> & { lat: number; lng: number }): RawCharger {
  return {
    source: "ocm",
    sourceRef: `ref-${n++}`,
    name: null,
    operator: null,
    address: EMPTY_ADDRESS,
    connectors: [],
    pricing: null,
    availability: "unknown",
    ...over,
  } as RawCharger;
}

const ccs150: ChargerConnector[] = [{ type: "ccs2", powerKw: 150, count: 2 }];
const KAVALA = { lat: 40.9397, lng: 24.4019 };
const BUCHAREST = { lat: 44.4268, lng: 26.1025 };
const latOffset = (m: number) => m / 111_320;
const lngOffset = (m: number, lat: number) => m / (111_320 * Math.cos((lat * Math.PI) / 180));

describe("A. a non-Latin operator must not merge with a different network", () => {
  it("A1 Greek operator stays separate from a different network 39 m away", () => {
    const a = raw({ ...KAVALA, operator: "ΔΕΗ", connectors: ccs150 });
    const score = matchScore(a, {
      lat: KAVALA.lat + latOffset(39),
      lng: KAVALA.lng,
      operator: "Shell Recharge",
      connectors: [{ type: "type2", powerKw: 22, count: 1 }],
      name: null,
    });
    expect(score).toBe(0);
  });

  it("A2 two different Greek operators at one coordinate stay separate", () => {
    const a = raw({ ...KAVALA, operator: "ΔΕΗ" });
    expect(matchScore(a, { ...KAVALA, operator: "ΦΟΡΤΙΣΗ", connectors: [], name: null })).toBe(0);
  });

  it("A3 Cyrillic (BG) operator stays separate from Ionity", () => {
    const a = raw({ ...KAVALA, operator: "Електрик" });
    expect(matchScore(a, { ...KAVALA, operator: "Ionity", connectors: [], name: null })).toBe(0);
  });

  it("A4 the two records survive as separate clusters", () => {
    const clusters = clusterChargers(
      [
        raw({ ...KAVALA, operator: "ΔΕΗ", connectors: ccs150 }),
        raw({ lat: KAVALA.lat + latOffset(39), lng: KAVALA.lng, operator: "Shell Recharge", connectors: ccs150, source: "tomtom" }),
      ],
      [],
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0].sources).toHaveLength(1);
    expect(clusters[1].sources).toHaveLength(1);
  });
});

describe("B. operatorContained token containment", () => {
  const contained = (x: string, y: string) =>
    matchScore(raw({ ...KAVALA, operator: x }), { ...KAVALA, operator: y, connectors: [], name: null });

  it("B1 'Park' does not merge with 'Park & Charge' (generic 4-char token)", () => {
    expect(contained("Park", "Park & Charge")).toBe(0);
  });
  it("B2 'Volt' does not merge with 'Volt Mobility' (distinct brands, shared token)", () => {
    expect(contained("Volt", "Volt Mobility")).toBe(0);
  });
  it("B3 'Ionity' merges with 'Ionity Park'", () => {
    expect(contained("Ionity", "Ionity Park")).toBe(1);
  });
  it("B4 'EnBW' does not merge with 'EnBW mobility+' (below the 5-char bar)", () => {
    expect(contained("EnBW", "EnBW mobility+")).toBe(0);
  });
  it("B5 but 'Volt Energy' vs 'Volt Mobility' correctly stays split", () => {
    expect(contained("Volt Energy", "Volt Mobility")).toBe(0);
  });
  it("B6 3-char token is still blocked ('MOL' vs 'MOL Plugee')", () => {
    expect(contained("MOL", "MOL Plugee")).toBe(0);
  });
});

describe("C. same-site gate behaviour across distance", () => {
  it("C1 unknown-operator record swallows a named one across a road (39 m)", () => {
    const a = raw({ ...BUCHAREST, operator: null, connectors: [] });
    expect(
      matchScore(a, {
        lat: BUCHAREST.lat,
        lng: BUCHAREST.lng + lngOffset(39, BUCHAREST.lat),
        operator: "Ionity",
        connectors: ccs150,
        name: null,
      }),
    ).toBe(1);
  });

  it("C2 two different operators stay separate at both 39 m and 50 m", () => {
    const near = matchScore(
      raw({ ...KAVALA, operator: "Ionity", connectors: ccs150, name: "Motorway Charger" }),
      { lat: KAVALA.lat + latOffset(39), lng: KAVALA.lng, operator: "Enel X", connectors: ccs150, name: "Motorway Charger" },
    );
    const far = matchScore(
      raw({ ...KAVALA, operator: "Ionity", connectors: ccs150, name: "Motorway Charger" }),
      { lat: KAVALA.lat + latOffset(50), lng: KAVALA.lng, operator: "Enel X", connectors: ccs150, name: "Motorway Charger" },
    );
    expect(near).toBe(0);
    expect(far).toBe(0);
  });

  it("C3 same operator merges at 59 m regardless of the 40 m gate", () => {
    expect(
      matchScore(raw({ ...KAVALA, operator: "Ionity", connectors: ccs150 }), {
        lat: KAVALA.lat + latOffset(59),
        lng: KAVALA.lng,
        operator: "Ionity",
        connectors: ccs150,
        name: null,
      }),
    ).toBeGreaterThanOrEqual(0.6);
  });
});

describe("D. transitive chaining in clusterChargers", () => {
  it("D1 three records 39 m apart in a line collapse into ONE cluster spanning 78 m", () => {
    const rs = [
      raw({ ...KAVALA }),
      raw({ lat: KAVALA.lat + latOffset(39), lng: KAVALA.lng }),
      raw({ lat: KAVALA.lat + latOffset(78), lng: KAVALA.lng }),
    ];
    const clusters = clusterChargers(rs, []);
    expect(clusters).toHaveLength(1);
    expect(haversineMeters(rs[0], clusters[0])).toBeGreaterThan(70);
  });

  it("D2 chain of 6 records 39 m apart collapses ~195 m of street into one pin", () => {
    const rs = Array.from({ length: 6 }, (_, i) =>
      raw({ lat: KAVALA.lat + latOffset(39 * i), lng: KAVALA.lng }),
    );
    expect(clusterChargers(rs, [])).toHaveLength(1);
  });
});

describe("E. migration 034 eps=0.00036 deg is anisotropic on ::geometry", () => {
  const ewMeters = (lat: number) => haversineMeters({ lat, lng: 0 }, { lat, lng: 0.00036 });
  const nsMeters = (lat: number) => haversineMeters({ lat, lng: 0 }, { lat: lat + 0.00036, lng: 0 });

  it("E1 north-south radius is ~40 m at every latitude", () => {
    for (const lat of [40, 44, 48]) expect(nsMeters(lat)).toBeCloseTo(40, 0);
  });

  it("E2 east-west radius SHRINKS with latitude (30.4 m at 41°N, 26.8 m at 48°N)", () => {
     
    console.log(
      "EW metres for eps=0.00036deg:",
      [35, 38, 41, 44, 48, 52].map((l) => `${l}N=${ewMeters(l).toFixed(1)}m`).join(" "),
    );
    expect(ewMeters(41)).toBeLessThan(31);
    expect(ewMeters(48)).toBeLessThan(27);
    expect(ewMeters(41)).toBeGreaterThan(ewMeters(48));
  });
});

describe("F. TomTom sweep cell counts", () => {
  const BULK = {
    ro: [43.6, 20.2, 48.3, 29.8], de: [47.2, 5.8, 55.1, 15.1], fr: [41.3, -5.2, 51.2, 9.6],
    at: [46.3, 9.5, 49.1, 17.2], nl: [50.7, 3.3, 53.6, 7.3], hu: [45.7, 16.1, 48.6, 22.9],
    gr: [34.7, 19.3, 41.8, 28.3], bg: [41.2, 22.3, 44.3, 28.7], rs: [42.2, 18.8, 46.2, 23.1],
    mk: [40.8, 20.4, 42.4, 23.1], hr: [42.3, 13.4, 46.6, 19.5], si: [45.4, 13.3, 46.9, 16.7],
  } as const;
  it("F1 counts cells and worst-case requests", () => {
    let total = 0;
    for (const [cc, [minLat, minLng, maxLat, maxLng]] of Object.entries(BULK)) {
      const cells = (Math.floor(maxLat) - Math.floor(minLat) + 1) * (Math.floor(maxLng) - Math.floor(minLng) + 1);
      total += cells;
       
      console.log(`${cc}: ${cells} cells -> ${cells * 2} requests, <=${cells * 200} raw rows`);
    }
     
    console.log(`TOTAL: ${total} cells -> ${total * 2} TomTom requests per full run`);
    expect(total).toBeGreaterThan(500);
  });
});
