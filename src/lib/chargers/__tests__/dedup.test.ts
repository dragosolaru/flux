import { describe, it, expect } from "vitest";
import { clusterChargers, haversineMeters, matchScore } from "../dedup";
import type { Charger, ChargerAddress, RawCharger } from "../types";

const emptyAddress: ChargerAddress = {
  street: null,
  city: null,
  region: null,
  country: null,
  postcode: null,
};

function raw(overrides: Partial<RawCharger>): RawCharger {
  return {
    source: "ocm",
    sourceRef: "1",
    lat: 44.4268,
    lng: 26.1025,
    name: "Ionity Bucuresti",
    operator: "Ionity",
    address: { ...emptyAddress },
    connectors: [{ type: "ccs2", powerKw: 350, count: 4 }],
    pricing: null,
    ...overrides,
  };
}

describe("haversineMeters", () => {
  it("returns ~0 for identical points", () => {
    const d = haversineMeters({ lat: 44.42, lng: 26.1 }, { lat: 44.42, lng: 26.1 });
    expect(d).toBeCloseTo(0, 5);
  });

  it("measures a known distance", () => {
    // ~0.001 deg latitude is ~111m.
    const d = haversineMeters({ lat: 44.42, lng: 26.1 }, { lat: 44.421, lng: 26.1 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});

describe("matchScore", () => {
  it("scores co-located same-operator records near 1", () => {
    const score = matchScore(raw({}), {
      lat: 44.4268,
      lng: 26.1025,
      operator: "Ionity",
      connectors: [{ type: "ccs2", powerKw: 350, count: 4 }],
      name: "Ionity Bucuresti",
    });
    expect(score).toBeGreaterThan(0.9);
  });

  it("scores far-apart records below the merge threshold", () => {
    const score = matchScore(raw({}), {
      lat: 44.46,
      lng: 26.1025,
      operator: "Ionity",
      connectors: [{ type: "ccs2", powerKw: 350, count: 4 }],
      name: "Ionity Bucuresti",
    });
    expect(score).toBeLessThan(0.6);
  });
});

describe("clusterChargers", () => {
  it("merges two co-located records with the same operator into one cluster", () => {
    const clusters = clusterChargers(
      [
        raw({ source: "ocm", sourceRef: "ocm-1" }),
        raw({ source: "osm", sourceRef: "osm-1", lat: 44.42682, lng: 26.10252 }),
      ],
      [],
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].sources).toHaveLength(2);
    expect(new Set(clusters[0].sources.map((s) => s.source))).toEqual(
      new Set(["ocm", "osm"]),
    );
  });

  it("force-merges same-point duplicates even with missing/different metadata", () => {
    // OCM often has duplicate community submissions at one coordinate with
    // sparse metadata. They must collapse into one charger, not stack on a point.
    const clusters = clusterChargers(
      [
        raw({ source: "ocm", sourceRef: "dup-1", operator: null, name: null }),
        raw({ source: "ocm", sourceRef: "dup-2", lat: 44.42681, lng: 26.10251, operator: "Other", name: "Different" }),
      ],
      [],
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].sources).toHaveLength(2);
  });

  it("keeps two clearly different operators at the same point as separate stations", () => {
    // Co-located but distinct networks (e.g. two operators in one car park) must
    // not be swallowed by the same-site merge — sources accumulate, not exclude.
    const clusters = clusterChargers(
      [
        raw({ source: "ocm", sourceRef: "a", operator: "Ionity", name: "Ionity Hub" }),
        raw({ source: "osm", sourceRef: "b", lat: 44.42681, lng: 26.10251, operator: "Enel X", name: "Enel Station" }),
      ],
      [],
    );
    expect(clusters).toHaveLength(2);
  });

  it("propagates an upstream address change onto the existing charger", () => {
    const existing: Charger = {
      id: "charger-addr",
      lat: 44.4268,
      lng: 26.1025,
      name: "Ionity Bucuresti",
      operator: "Ionity",
      operatorId: "ionity",
      address: { street: "Old Street 1", city: "Bucuresti", region: null, country: "RO", postcode: "010101" },
      connectors: [{ type: "ccs2", powerKw: 350, count: 4 }],
      maxPowerKw: 350,
      pricing: null,
      availability: "unknown",
      confidence: 0.5,
      sources: [{ source: "ocm", ref: "ocm-addr" }],
      lastSeenAt: "2026-06-03T00:00:00.000Z",
    };
    // Same OCM ref re-fetched with a corrected street.
    const clusters = clusterChargers(
      [
        raw({
          source: "ocm",
          sourceRef: "ocm-addr",
          address: { street: "New Street 99", city: "Bucuresti", region: null, country: "RO", postcode: "010101" },
        }),
      ],
      [existing],
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchedExistingId).toBe("charger-addr");
    expect(clusters[0].address.street).toBe("New Street 99");
  });

  it("keeps records 500m apart as separate clusters", () => {
    const clusters = clusterChargers(
      [
        raw({ source: "ocm", sourceRef: "a", lat: 44.4268, lng: 26.1025 }),
        // ~500m north.
        raw({ source: "osm", sourceRef: "b", lat: 44.4313, lng: 26.1025 }),
      ],
      [],
    );
    expect(clusters).toHaveLength(2);
  });

  it("merges a raw into an existing canonical charger and sets matchedExistingId", () => {
    const existing: Charger = {
      id: "charger-123",
      lat: 44.4268,
      lng: 26.1025,
      name: "Ionity Bucuresti",
      operator: "Ionity",
      operatorId: "ionity",
      address: { ...emptyAddress },
      connectors: [{ type: "ccs2", powerKw: 350, count: 4 }],
      maxPowerKw: 350,
      pricing: null,
      availability: "unknown",
      confidence: 0.5,
      sources: [{ source: "ocm", ref: "ocm-1" }],
      lastSeenAt: "2026-06-03T00:00:00.000Z",
    };
    const clusters = clusterChargers(
      [raw({ source: "osm", sourceRef: "osm-9", lat: 44.42681, lng: 26.10251 })],
      [existing],
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchedExistingId).toBe("charger-123");
    expect(new Set(clusters[0].sources.map((s) => s.source))).toEqual(
      new Set(["ocm", "osm"]),
    );
  });

  it("treats an exact (source, sourceRef) already in an existing charger as a definite match", () => {
    const existing: Charger = {
      id: "charger-dup",
      lat: 10,
      lng: 10,
      name: "Far Station",
      operator: "Other",
      operatorId: "other",
      address: { ...emptyAddress },
      connectors: [],
      maxPowerKw: null,
      pricing: null,
      availability: "unknown",
      confidence: 0.5,
      sources: [{ source: "ocm", ref: "ocm-1" }],
      lastSeenAt: "2026-06-03T00:00:00.000Z",
    };
    // Same source ref but coordinates nowhere near the existing charger.
    const clusters = clusterChargers(
      [raw({ source: "ocm", sourceRef: "ocm-1", lat: 44.4268, lng: 26.1025 })],
      [existing],
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchedExistingId).toBe("charger-dup");
  });

  it("unions connectors deduping by type+rounded-power", () => {
    const clusters = clusterChargers(
      [
        raw({
          source: "ocm",
          sourceRef: "ocm-1",
          connectors: [{ type: "ccs2", powerKw: 350, count: 4 }],
        }),
        raw({
          source: "osm",
          sourceRef: "osm-1",
          lat: 44.42682,
          lng: 26.10252,
          connectors: [
            { type: "ccs2", powerKw: 350.2, count: 2 },
            { type: "chademo", powerKw: 50, count: 1 },
          ],
        }),
      ],
      [],
    );
    expect(clusters).toHaveLength(1);
    const fps = clusters[0].connectors
      .map((c) => `${c.type}:${Math.round(c.powerKw ?? 0)}`)
      .sort();
    expect(fps).toEqual(["ccs2:350", "chademo:50"]);
  });

  it("raises confidence as more independent sources agree", () => {
    const single = clusterChargers([raw({ source: "ocm", sourceRef: "s1" })], []);
    const dual = clusterChargers(
      [
        raw({ source: "ocm", sourceRef: "s1" }),
        raw({ source: "osm", sourceRef: "s2", lat: 44.42682, lng: 26.10252 }),
      ],
      [],
    );
    expect(dual[0].confidence).toBeGreaterThan(single[0].confidence);
  });

  it("flags a conflict when merged sources disagree on power", () => {
    // Same operator + same point → merge, but the two sources report very
    // different max power, which lowers confidence via the conflict penalty.
    const clusters = clusterChargers(
      [
        raw({ source: "ocm", sourceRef: "s1", operator: "Ionity", name: "Hub", connectors: [{ type: "ccs2", powerKw: 50, count: 1 }] }),
        raw({
          source: "osm",
          sourceRef: "s2",
          lat: 44.42682,
          lng: 26.10252,
          operator: "Ionity",
          name: "Hub",
          connectors: [{ type: "ccs2", powerKw: 350, count: 1 }],
        }),
      ],
      [],
    );
    expect(clusters).toHaveLength(1);
    // Two sources with a conflict: 0.75 base minus 0.15 penalty plus bonuses.
    expect(clusters[0].confidence).toBeLessThan(0.75);
  });
});

// ---------------------------------------------------------------------------
// Source-ref uniqueness — a cluster must never list the same (source, ref)
// twice. The batch upsert writes charger_sources with ON CONFLICT DO UPDATE,
// and a repeated conflict key inside one statement aborts the entire RPC.
// ---------------------------------------------------------------------------

describe("cluster source refs are unique", () => {
  it("does not re-append the ref that matched an existing charger", () => {
    const existing: Charger = {
      id: "11111111-1111-4111-8111-111111111111",
      lat: 44.4268,
      lng: 26.1025,
      name: "Existing",
      operator: "Ionity",
      operatorId: "ionity",
      address: { street: null, city: null, region: null, country: "RO", postcode: null },
      connectors: [],
      maxPowerKw: 150,
      pricing: null,
      availability: "operational",
      sources: [{ source: "ocm", ref: "abc" }],
      confidence: 0.8,
      sourceCount: 1,
    } as unknown as Charger;

    const clusters = clusterChargers(
      [
        {
          source: "ocm",
          sourceRef: "abc",
          lat: 44.4268,
          lng: 26.1025,
          name: "Existing",
          operator: "Ionity",
          address: { street: null, city: null, region: null, country: "RO", postcode: null },
          connectors: [],
          pricing: null,
          availability: "operational",
        } as unknown as RawCharger,
      ],
      [existing],
    );

    expect(clusters).toHaveLength(1);
    const keys = clusters[0].sources.map((s) => `${s.source}:${s.ref}`);
    expect(keys).toEqual([...new Set(keys)]);
    expect(keys).toEqual(["ocm:abc"]);
  });
});
