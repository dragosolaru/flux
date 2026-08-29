// Fixtures are verbatim features from the live NDW endpoint, captured through
// the debug panel's raw source probe. The connector this replaces was written
// against a schema the service does not return, so these exist to keep the
// mapping pinned to observed data rather than to a plausible-looking guess.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { canonicalConnectorType } from "../normalize";
import type { BBox } from "../types";

// The connector logs failures to Supabase; the tests exercise the failure paths
// and have no database.
vi.mock("@/lib/debug-log", () => ({ recordDebugLog: vi.fn() }));

const AMSTERDAM = { minLat: 52.3, minLng: 4.8, maxLat: 52.4, maxLng: 4.95 };
const KAVALA = { minLat: 40.9, minLng: 24.3, maxLat: 41.0, maxLng: 24.5 };

const LIVE_RESPONSE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "NL-TNM-7",
      geometry: { type: "Point", coordinates: [4.800828, 52.396347] },
      properties: {
        address: "Galwin 6",
        last_updated: "2026-08-07T16:17:08Z",
        open: false,
        cpo_id: "TNM",
        country: "NLD",
        operator_name: "Shell Recharge",
        owner_name: "Shell Recharge",
        suboperator_name: null,
        availabilities: [
          {
            available: 1,
            connector_format: "CABLE",
            connector_type: "CHADEMO",
            power_max: 70000.0,
            power_type: "DC",
            total: 2,
          },
          {
            available: 1,
            connector_format: "CABLE",
            connector_type: "IEC_62196_T2_COMBO",
            power_max: 175000.0,
            power_type: "DC",
            total: 2,
          },
        ],
      },
    },
    {
      type: "Feature",
      id: "NL-LNT-4174919",
      geometry: { type: "Point", coordinates: [4.805784, 52.396519] },
      properties: {
        address: "Hornweg 64",
        country: "NLD",
        operator_name: "Laadnet",
        owner_name: "Laadnet",
        availabilities: [
          {
            available: 4,
            connector_format: "SOCKET",
            connector_type: "IEC_62196_T2",
            power_max: 22000.0,
            power_type: "AC3",
            total: 4,
          },
        ],
      },
    },
  ],
};

function mockFetch(handler: (url: string) => { status: number; body: unknown }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const { status, body } = handler(String(input));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
}

describe("NDW connector — live response shape", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch(() => ({ status: 200, body: LIVE_RESPONSE }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("maps a feature the service actually returns", async () => {
    const { ndwConnector } = await import("../ingest/ndw");
    const rows = await ndwConnector.fetchTile(AMSTERDAM);

    expect(rows).toHaveLength(2);
    const shell = rows.find((r) => r.sourceRef === "NL-TNM-7");
    expect(shell).toBeDefined();
    expect(shell!.operator).toBe("Shell Recharge");
    expect(shell!.name).toBe("Galwin 6");
    expect(shell!.lat).toBeCloseTo(52.396347, 5);
    expect(shell!.lng).toBeCloseTo(4.800828, 5);
  });

  it("reads the id from the feature, not from a properties field that does not exist", async () => {
    const { ndwConnector } = await import("../ingest/ndw");
    const rows = await ndwConnector.fetchTile(AMSTERDAM);
    // The old connector looked for properties.uid / properties.id and fell back
    // to a coordinate string, so every row got a synthetic ref and no two
    // ingests could match the same station.
    expect(rows.map((r) => r.sourceRef).sort()).toEqual(["NL-LNT-4174919", "NL-TNM-7"]);
  });

  it("converts power from watts and keeps the stall count", async () => {
    const { ndwConnector } = await import("../ingest/ndw");
    const rows = await ndwConnector.fetchTile(AMSTERDAM);
    const shell = rows.find((r) => r.sourceRef === "NL-TNM-7")!;

    expect(shell.connectors).toHaveLength(2);
    expect(shell.connectors.map((c) => c.powerKw).sort((a, b) => a! - b!)).toEqual([70, 175]);
    expect(shell.connectors.every((c) => c.count === 2)).toBe(true);
  });

  it("maps IEC_62196_T2_COMBO to CCS2, not plain Type 2", async () => {
    // A 175 kW DC stall filed as 22 kW AC would be routed around by the planner
    // and hidden by the kW filter.
    const { ndwConnector } = await import("../ingest/ndw");
    const rows = await ndwConnector.fetchTile(AMSTERDAM);
    const shell = rows.find((r) => r.sourceRef === "NL-TNM-7")!;

    const ccs = shell.connectors.find((c) => c.powerKw === 175);
    expect(ccs!.type).toBe("ccs2");
    expect(shell.connectors.find((c) => c.powerKw === 70)!.type).toBe("chademo");
  });

  it("narrows the alpha-3 country to the char(2) column", async () => {
    // chargers.country is char(2); storing "NLD" is a write error, not a typo.
    const { ndwConnector } = await import("../ingest/ndw");
    const rows = await ndwConnector.fetchTile(AMSTERDAM);
    expect(rows.every((r) => r.address.country === "NL")).toBe(true);
  });

  it("is not queried for a bbox outside the Netherlands", async () => {
    // The run of `fetch 400` in the field came from ingesting Greece: the
    // connector had no geographic gate and was called for every tile.
    const { ndwConnector } = await import("../ingest/ndw");
    const rows = await ndwConnector.fetchTile(KAVALA);

    expect(rows).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("always sends a bbox — the endpoint answers 400 without one", async () => {
    const { ndwConnector } = await import("../ingest/ndw");
    await ndwConnector.fetchTile(AMSTERDAM);

    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain("bbox=");
    expect(new URL(url).searchParams.get("bbox")).toBe("4.8,52.3,4.95,52.4");
  });
});

describe("NDW connector — failures stay contained", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns nothing rather than throwing on a 400", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({
        status: 400,
        body: { code: "INVALID_ARGUMENT", message: "Invalid parameter format" },
      })),
    );
    const { ndwConnector } = await import("../ingest/ndw");
    await expect(ndwConnector.fetchTile(AMSTERDAM)).resolves.toEqual([]);
  });

  it("tolerates a feature with no availabilities", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => ({
        status: 200,
        body: {
          features: [
            {
              id: "NL-X-1",
              geometry: { coordinates: [4.9, 52.37] },
              properties: { country: "NLD", operator_name: "Test" },
            },
          ],
        },
      })),
    );
    const { ndwConnector } = await import("../ingest/ndw");
    const rows = await ndwConnector.fetchTile(AMSTERDAM);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.connectors).toEqual([]);
  });
});

describe("OCPI connector identifiers", () => {
  // These strings come from the OCPI standard, so every OCPI-derived feed uses
  // them — this is not NDW-specific.
  it.each([
    ["IEC_62196_T2_COMBO", "ccs2"],
    ["IEC_62196_T1_COMBO", "ccs1"],
    ["IEC_62196_T2", "type2"],
    ["IEC_62196_T1", "type1"],
    ["CHADEMO", "chademo"],
  ])("%s → %s", (input, expected) => {
    expect(canonicalConnectorType(input)).toBe(expected);
  });
});

/**
 * Overlapping the Netherlands is not the same as fitting inside it.
 *
 * The connector had a geographic gate and it was not enough: a corridor tile
 * spanning 6,43 → 22,53 clips the Dutch border by a corner while being sixteen
 * degrees wide, and the endpoint rejects anything much larger than a province.
 * Every corridor ingest logged `fetch 400` with a bbox covering half of Europe,
 * for three weeks, and the log line looked like an API problem rather than ours.
 */
describe("clamping a request to the country", () => {
  const NL = { minLng: 3.3, minLat: 50.7, maxLng: 7.3, maxLat: 53.6 };
  const STEP = 0.5;

  const clamp = (b: BBox): BBox => ({
    minLat: Math.max(b.minLat, NL.minLat),
    minLng: Math.max(b.minLng, NL.minLng),
    maxLat: Math.min(b.maxLat, NL.maxLat),
    maxLng: Math.min(b.maxLng, NL.maxLng),
  });

  const corridor: BBox = { minLng: 6, minLat: 43, maxLng: 22, maxLat: 53 };

  it("never asks for anything outside the country", () => {
    const c = clamp(corridor);
    expect(c.minLat).toBeGreaterThanOrEqual(NL.minLat);
    expect(c.maxLng).toBeLessThanOrEqual(NL.maxLng);
  });

  it("turns the offending tile into something the endpoint accepts", () => {
    const c = clamp(corridor);
    // 16° wide before, well under a degree and a half after.
    expect(corridor.maxLng - corridor.minLng).toBeGreaterThan(15);
    expect(c.maxLng - c.minLng).toBeLessThanOrEqual(1.5);
  });

  it("still needs sweeping when the clip is wider than one window", () => {
    const c = clamp(corridor);
    const needsSweep = c.maxLng - c.minLng > STEP || c.maxLat - c.minLat > STEP;
    expect(needsSweep).toBe(true);
  });
});
