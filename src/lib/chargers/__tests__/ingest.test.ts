import { describe, it, expect } from "vitest";
import { mapOcmPoi } from "../ingest/ocm";
import { mapOverpassElement } from "../ingest/overpass";
import { mapTomTomResult } from "../ingest/tomtom";

describe("mapOcmPoi", () => {
  it("maps a full OCM POI to a RawCharger", () => {
    const poi = {
      ID: 12345,
      AddressInfo: {
        Title: "Ionity Sibiu",
        AddressLine1: "A1 Motorway km 250",
        Town: "Sibiu",
        StateOrProvince: "Sibiu",
        Country: { ISOCode: "RO" },
        Postcode: "550000",
        Latitude: 45.79,
        Longitude: 24.15,
      },
      OperatorInfo: { Title: "IONITY GmbH" },
      Connections: [
        { ConnectionType: { ID: 33, Title: "CCS (Type 2)" }, PowerKW: 350, Quantity: 4 },
        { ConnectionTypeID: 2, PowerKW: 50, Quantity: 1 },
      ],
    };

    const raw = mapOcmPoi(poi);
    expect(raw).not.toBeNull();
    expect(raw!.source).toBe("ocm");
    expect(raw!.sourceRef).toBe("12345");
    expect(raw!.lat).toBe(45.79);
    expect(raw!.lng).toBe(24.15);
    expect(raw!.name).toBe("Ionity Sibiu");
    expect(raw!.operator).toBe("IONITY GmbH");
    expect(raw!.address).toEqual({
      street: "A1 Motorway km 250",
      city: "Sibiu",
      region: "Sibiu",
      country: "RO",
      postcode: "550000",
    });
    expect(raw!.connectors).toEqual([
      { type: "ccs2", powerKw: 350, count: 4 },
      { type: "chademo", powerKw: 50, count: 1 },
    ]);
    expect(raw!.pricing).toBeNull();
  });

  it("falls back to ConnectionTypeID and default count", () => {
    const poi = {
      ID: 7,
      AddressInfo: { Latitude: 1, Longitude: 2 },
      Connections: [{ ConnectionTypeID: 25, PowerKW: 22 }],
    };
    const raw = mapOcmPoi(poi);
    expect(raw!.connectors).toEqual([{ type: "type2", powerKw: 22, count: 1 }]);
    expect(raw!.operator).toBeNull();
    expect(raw!.name).toBeNull();
  });

  it("returns null without coordinates or id", () => {
    expect(mapOcmPoi({ ID: 1, AddressInfo: { Latitude: 1 } })).toBeNull();
    expect(mapOcmPoi({ AddressInfo: { Latitude: 1, Longitude: 2 } })).toBeNull();
    expect(mapOcmPoi({ ID: 1 })).toBeNull();
  });

  it("derives availability from status + last-verified date", () => {
    const base = { ID: 1, AddressInfo: { Latitude: 1, Longitude: 2 } };
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();

    // Operational + recently verified → operational.
    expect(
      mapOcmPoi({ ...base, StatusType: { IsOperational: true }, DateLastVerified: recent })!.availability,
    ).toBe("operational");
    // Operational but stale verification → stale.
    expect(
      mapOcmPoi({ ...base, StatusType: { IsOperational: true }, DateLastVerified: old })!.availability,
    ).toBe("stale");
    // Explicitly not operational → offline.
    expect(
      mapOcmPoi({ ...base, StatusType: { IsOperational: false } })!.availability,
    ).toBe("offline");
    // StatusTypeID fallback (50 = operational) when no verbose object.
    expect(mapOcmPoi({ ...base, StatusTypeID: 50 })!.availability).toBe("operational");
    expect(mapOcmPoi({ ...base, StatusTypeID: 100 })!.availability).toBe("offline");
    // No signal at all → unknown.
    expect(mapOcmPoi(base)!.availability).toBe("unknown");
  });
});

describe("mapTomTomResult", () => {
  it("maps a TomTom EV result to a RawCharger", () => {
    const raw = mapTomTomResult({
      id: "RO-12345",
      position: { lat: 46.74, lon: 23.49 },
      poi: { name: "Renovatio Florești", brands: [{ name: "Renovatio" }] },
      address: {
        streetName: "Strada Florilor",
        municipality: "Florești",
        countrySubdivision: "Cluj",
        countryCode: "RO",
        postalCode: "407280",
      },
      chargingPark: {
        connectors: [
          { connectorType: "IEC62196Type2CCS", ratedPowerKW: 150 },
          { connectorType: "Chademo", ratedPowerKW: 50 },
        ],
      },
    });
    expect(raw).not.toBeNull();
    expect(raw!.source).toBe("tomtom");
    expect(raw!.sourceRef).toBe("RO-12345");
    expect(raw!.lat).toBe(46.74);
    expect(raw!.lng).toBe(23.49);
    expect(raw!.operator).toBe("Renovatio");
    expect(raw!.address.city).toBe("Florești");
    expect(raw!.address.country).toBe("RO");
    expect(raw!.connectors).toEqual([
      { type: "ccs2", powerKw: 150, count: 1 },
      { type: "chademo", powerKw: 50, count: 1 },
    ]);
  });

  it("returns null without coordinates or id", () => {
    expect(mapTomTomResult({ id: "x", position: { lat: 1 } })).toBeNull();
    expect(mapTomTomResult({ position: { lat: 1, lon: 2 } })).toBeNull();
  });
});

describe("mapOverpassElement", () => {
  it("maps socket:* tags into per-type connectors", () => {
    const el = {
      type: "node" as const,
      id: 99,
      lat: 44.43,
      lon: 26.1,
      tags: {
        name: "Fastned Bucuresti",
        operator: "Fastned",
        "socket:type2": "2",
        "socket:type2:output": "22 kW",
        "socket:type2_combo": "4",
        "socket:type2_combo:output": "150 kW",
        "addr:street": "Bd. Unirii",
        "addr:housenumber": "12",
        "addr:city": "Bucuresti",
        "addr:country": "RO",
        "addr:postcode": "030167",
      },
    };

    const raw = mapOverpassElement(el);
    expect(raw).not.toBeNull();
    expect(raw!.source).toBe("osm");
    expect(raw!.sourceRef).toBe("node/99");
    expect(raw!.operator).toBe("Fastned");
    expect(raw!.address.city).toBe("Bucuresti");
    // House number is appended to the street so the address is complete.
    expect(raw!.address.street).toBe("Bd. Unirii 12");

    const byType = Object.fromEntries(raw!.connectors.map((c) => [c.type, c]));
    expect(byType["type2"]).toEqual({ type: "type2", powerKw: 22, count: 2 });
    expect(byType["ccs2"]).toEqual({ type: "ccs2", powerKw: 150, count: 4 });
  });

  it("falls back to a single 'other' connector when no socket tags", () => {
    const el = {
      type: "way" as const,
      id: 5,
      center: { lat: 46.77, lon: 23.59 },
      tags: { network: "Enel X", maxpower: "50000", capacity: "3" },
    };

    const raw = mapOverpassElement(el);
    expect(raw!.sourceRef).toBe("way/5");
    expect(raw!.operator).toBe("Enel X");
    expect(raw!.connectors).toEqual([{ type: "other", powerKw: 50, count: 3 }]);
  });

  it("returns null when no coordinates resolve", () => {
    expect(mapOverpassElement({ type: "node", id: 1, tags: {} })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OCM placeholder operators — storing "(Unknown Operator)" verbatim makes it a
// real operator_id, so dedup would read two unrelated networks that both carry
// the placeholder as the same operator and merge them.
// ---------------------------------------------------------------------------

describe("OCM operator placeholders", () => {
  function poiWithOperator(title: string | null) {
    return {
      ID: 1,
      AddressInfo: { Title: "Site", Latitude: 44.4, Longitude: 26.1 },
      OperatorInfo: title === null ? null : { Title: title },
      Connections: [],
    };
  }

  it("drops OCM's unknown-operator placeholder", () => {
    expect(mapOcmPoi(poiWithOperator("(Unknown Operator)"))?.operator).toBeNull();
    expect(mapOcmPoi(poiWithOperator("Unknown"))?.operator).toBeNull();
    expect(mapOcmPoi(poiWithOperator("N/A"))?.operator).toBeNull();
    expect(mapOcmPoi(poiWithOperator("   "))?.operator).toBeNull();
  });

  it("keeps a real operator name", () => {
    expect(mapOcmPoi(poiWithOperator("Ionity"))?.operator).toBe("Ionity");
    expect(mapOcmPoi(poiWithOperator("PPC blue"))?.operator).toBe("PPC blue");
  });
});
