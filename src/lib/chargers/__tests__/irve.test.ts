// The header and rows below are copied verbatim from the live data.gouv.fr
// resource, captured through the debug panel's raw source probe. The connector
// this replaces parsed the resource as GeoJSON and read a `type_prise` column
// that the schema does not have, so these tests exist to pin the mapping to the
// file as published.

import { describe, it, expect, vi } from "vitest";

import { parseCsvLine, stationsFromCsv } from "../ingest/irve";

vi.mock("@/lib/debug-log", () => ({ recordDebugLog: vi.fn() }));

const HEADER =
  "nom_amenageur,siren_amenageur,contact_amenageur,nom_operateur,contact_operateur,telephone_operateur,nom_enseigne,id_station_itinerance,id_station_local,nom_station,implantation_station,adresse_station,code_insee_commune,coordonneesXY,nbre_pdc,id_pdc_itinerance,id_pdc_local,puissance_nominale,prise_type_ef,prise_type_2,prise_type_combo_ccs,prise_type_chademo,prise_type_autre,gratuit,paiement_acte,paiement_cb,paiement_autre,tarification,condition_acces,reservation,horaires,accessibilite_pmr,restriction_gabarit,station_deux_roues,raccordement,num_pdl,date_mise_en_service,observations,date_maj,cable_t2_attache,last_modified,datagouv_dataset_id,datagouv_resource_id,datagouv_organization_or_owner,created_at,consolidated_longitude,consolidated_latitude,consolidated_code_postal,consolidated_commune,consolidated_is_lon_lat_correct,consolidated_is_code_insee_verified,consolidated_is_code_insee_modified";

// Three charge points of one ChargePoint station — lowercase booleans.
const CHARGEPOINT_ROWS = [1, 2, 3].map(
  (n) =>
    `ChargePoint,,info@chargepoint.com,ChargePoint,info@chargepoint.com,+33 (1) 49939011,Asia Automotive,ATHTBE101206${n},ATHTBE101206${n},Asia Automotive,Voirie,"3 Rue Laurent Lavoisier, 80330 Longueau",,"[2.36761800,49.87723700]",3,ATHTBE101206${n},ATHTBE101206${n},22,false,true,false,false,false,false,true,true,,,Accès réservé,false,24/7,Accessibilité inconnue,inconnu,false,,,2022-03-22,EF connector is available at the site separately,2026-08-06,false,2026-08-06T21:00:17.244000+00:00,64060c2ac773dcf3fabbe5d2,b11113db-875d-41c7-8673-0cf8ad43e917,eco-movement,2023-06-28T11:46:08.539000+00:00,2.367618,49.877237,,,False,False,False`,
);

// A different publisher for the same forecourt — UPPERCASE booleans, 44 kW,
// and "Non concerné" in the roaming-id column.
const RAIDEN_ROW = `ASIA AUTOMOTIVE,892613597,laurent@lanie.fr,RAIDEN,contact@chargeguru.com,188246000,ASIA AUTOMOTIVE,Non concerné,,ASIA AUTOMOTIVE,Parking public,3 Rue Laurent Lavoisier 80330 Longueau,80489,"[2.3673462, 49.8762485]",2,ATHTBE1012062,,44,TRUE,TRUE,FALSE,FALSE,FALSE,,FALSE,,,,Accès libre,FALSE,24/7,Accessibilité inconnue,Inconnue,FALSE,,,2021-10-13,,2021-10-13,,2026-04-20T12:11:36.189000+00:00,63f38ce81be1f6867a668b51,5be52fb0-72ca-43c6-b88d-0d56fb3efff6,raiden-sas,2025-10-07T09:11:00.465000+00:00,2.3673462,49.8762485,80330,Longueau,True,True,False`;

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      // Deliberately split mid-content so the line reader has to stitch chunks
      // back together — the 163 MB download arrives in many pieces.
      const mid = Math.floor(bytes.length / 2);
      controller.enqueue(bytes.slice(0, mid));
      controller.enqueue(bytes.slice(mid));
      controller.close();
    },
  });
}

describe("parseCsvLine", () => {
  it("keeps commas inside quoted fields", () => {
    // adresse_station and coordonneesXY both contain commas; splitting on comma
    // shifts every later column by one.
    const fields = parseCsvLine('a,"3 Rue Laurent Lavoisier, 80330 Longueau","[2.36,49.87]",b');
    expect(fields).toEqual(["a", "3 Rue Laurent Lavoisier, 80330 Longueau", "[2.36,49.87]", "b"]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsvLine('x,"say ""hi""",y')).toEqual(["x", 'say "hi"', "y"]);
  });

  it("preserves empty trailing fields", () => {
    expect(parseCsvLine("a,,b,")).toEqual(["a", "", "b", ""]);
  });
});

describe("IRVE CSV → stations", () => {
  it("collapses charge points into one station per roaming id", async () => {
    // The file is one row per charge point. Emitting a row each would hand the
    // dedup thousands of co-located points; the station id makes it exact here.
    const rows = await stationsFromCsv(streamOf([HEADER, ...CHARGEPOINT_ROWS].join("\n")));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.sourceRef)).size).toBe(3);
  });

  it("aggregates several charge points that share a station id", async () => {
    const shared = CHARGEPOINT_ROWS.map((r) =>
      r.replace(/ATHTBE101206[123],ATHTBE101206[123],Asia/, "ATHTBE1012061,ATHTBE1012061,Asia"),
    );
    const rows = await stationsFromCsv(streamOf([HEADER, ...shared].join("\n")));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sourceRef).toBe("ATHTBE1012061");
    expect(rows[0]!.connectors.find((c) => c.type === "type2")!.count).toBe(3);
  });

  it("reads connectors from the boolean columns, not a type_prise field", async () => {
    const rows = await stationsFromCsv(streamOf([HEADER, CHARGEPOINT_ROWS[0]!].join("\n")));
    const types = rows[0]!.connectors.map((c) => c.type).sort();
    // prise_type_2 is the only one set to true on this row.
    expect(types).toEqual(["type2"]);
    expect(rows[0]!.connectors[0]!.powerKw).toBe(22);
  });

  it("accepts UPPERCASE booleans from the other publisher", async () => {
    // Both spellings appear within a few rows of each other in the real file.
    const rows = await stationsFromCsv(streamOf([HEADER, RAIDEN_ROW].join("\n")));
    const types = rows[0]!.connectors.map((c) => c.type).sort();
    expect(types).toEqual(["schuko", "type2"]);
    expect(rows[0]!.connectors.find((c) => c.type === "type2")!.powerKw).toBe(44);
  });

  it("does not collapse every non-roaming station into one", async () => {
    // id_station_itinerance is "Non concerné" for stations outside the roaming
    // network. Treating that as an id would merge unrelated sites nationwide.
    const second = RAIDEN_ROW.replace("2.3673462,49.8762485,80330,Longueau", "3.1,45.2,69000,Lyon")
      .replace('"[2.3673462, 49.8762485]"', '"[3.1, 45.2]"');
    const rows = await stationsFromCsv(streamOf([HEADER, RAIDEN_ROW, second].join("\n")));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.sourceRef)).size).toBe(2);
  });

  it("prefers the consolidated coordinates over the raw ones", async () => {
    const rows = await stationsFromCsv(streamOf([HEADER, CHARGEPOINT_ROWS[0]!].join("\n")));
    expect(rows[0]!.lat).toBeCloseTo(49.877237, 6);
    expect(rows[0]!.lng).toBeCloseTo(2.367618, 6);
  });

  it("falls back to coordonneesXY when the consolidated columns are empty", async () => {
    const noConsolidated = CHARGEPOINT_ROWS[0]!.replace(
      ",2.367618,49.877237,,,False,False,False",
      ",,,,,False,False,False",
    );
    const rows = await stationsFromCsv(streamOf([HEADER, noConsolidated].join("\n")));
    expect(rows[0]!.lng).toBeCloseTo(2.367618, 6);
    expect(rows[0]!.lat).toBeCloseTo(49.877237, 6);
  });

  it("carries the address and marks the country", async () => {
    const rows = await stationsFromCsv(streamOf([HEADER, CHARGEPOINT_ROWS[0]!].join("\n")));
    expect(rows[0]!.address.street).toBe("3 Rue Laurent Lavoisier, 80330 Longueau");
    expect(rows[0]!.address.country).toBe("FR");
    expect(rows[0]!.operator).toBe("ChargePoint");
  });

  it("skips a row with no usable coordinates", async () => {
    const broken = CHARGEPOINT_ROWS[0]!
      .replace('"[2.36761800,49.87723700]"', '""')
      .replace(",2.367618,49.877237,,,False,False,False", ",,,,,False,False,False");
    const rows = await stationsFromCsv(streamOf([HEADER, broken].join("\n")));
    expect(rows).toEqual([]);
  });

  it("reassembles lines split across stream chunks", async () => {
    // streamOf splits mid-content on purpose; a naive per-chunk parser drops or
    // corrupts the row straddling the boundary.
    const rows = await stationsFromCsv(
      streamOf([HEADER, ...CHARGEPOINT_ROWS, RAIDEN_ROW].join("\n")),
    );
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))).toBe(true);
  });
});

describe("IRVE tile path", () => {
  it("returns nothing — a map tile must not pull a 163 MB file", async () => {
    const { irveConnector } = await import("../ingest/irve");
    await expect(
      irveConnector.fetchTile({ minLat: 48.8, minLng: 2.3, maxLat: 48.9, maxLng: 2.4 }),
    ).resolves.toEqual([]);
  });
});
