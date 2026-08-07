// French IRVE open data (data.gouv.fr), legally mandated under AFIR.
// License: Open License v2.0. No API key.
//
// Rewritten after the raw source probe showed what the resource actually is:
//
//   content-type: text/csv          (the connector parsed it as GeoJSON)
//   162,965,758 characters          (~163 MB, 11.4 s just to transfer)
//   consolidation-etalab-schema-irve-statique-v-2.3.1
//
// Two consequences, both structural rather than a parsing bug:
//
//  * There is no per-tile path any more. Answering one map tile cannot mean
//    downloading 163 MB, and the previous module-level cache made that a cold
//    start away from happening on a user request. IRVE now contributes through
//    the scheduled bulk import only, like a national register should.
//
//  * Rows are per charge point (`id_pdc_itinerance`), not per station. One
//    forecourt appears as many rows sharing `id_station_itinerance`. Emitting a
//    row each would hand the dedup thousands of co-located points to collapse;
//    they are aggregated here, where the station id makes it exact.
//
// Parsed as a stream: holding 163 MB as one string, then again as parsed rows,
// is how a function runs out of memory rather than time.

import type { BBox, ChargerConnector, ConnectorType, RawCharger, SourceConnector } from "../types";
import { recordDebugLog } from "@/lib/debug-log";

const IRVE_URL =
  "https://www.data.gouv.fr/fr/datasets/r/eb76d20a-8501-400e-b336-d85724de5435";

// Boolean connector columns → canonical type. `prise_type_ef` is a domestic
// socket (prise renforcée); `autre` carries no type information.
const CONNECTOR_COLUMNS: [string, ConnectorType][] = [
  ["prise_type_2", "type2"],
  ["prise_type_combo_ccs", "ccs2"],
  ["prise_type_chademo", "chademo"],
  ["prise_type_ef", "schuko"],
];

/**
 * The file mixes `true`/`false` with `TRUE`/`FALSE` — the two publishers
 * feeding the consolidation disagree, and both appear within a few rows of each
 * other. Empty means "not stated", which is not the same as false but is
 * treated as such here because a connector is only claimed when asserted.
 */
function isTrue(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "true";
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * A single CSV record, honouring RFC 4180 quoting.
 *
 * Hand-rolled because the fields need it: `adresse_station` holds
 * `"3 Rue Laurent Lavoisier, 80330 Longueau"` and `coordonneesXY` holds
 * `"[2.36761800,49.87723700]"` — both commas inside quotes.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** `"[2.36761800,49.87723700]"` → [lng, lat]. */
function parseCoordinates(value: string | undefined): [number, number] | null {
  if (!value) return null;
  const m = /\[?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]?/.exec(value);
  if (!m) return null;
  const lng = Number.parseFloat(m[1]!);
  const lat = Number.parseFloat(m[2]!);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

interface StationAccumulator {
  ref: string;
  lat: number;
  lng: number;
  name: string | null;
  operator: string | null;
  street: string | null;
  postcode: string | null;
  city: string | null;
  /** type → highest power seen, and how many points carried it. */
  connectors: Map<ConnectorType, { powerKw: number | null; count: number }>;
}

function accumulate(
  stations: Map<string, StationAccumulator>,
  row: Record<string, string>,
): void {
  // The consolidated columns are the cleaned ones; coordonneesXY is the raw
  // publisher value and is sometimes swapped or empty.
  const lat = toNumber(row.consolidated_latitude);
  const lng = toNumber(row.consolidated_longitude);
  const fallback = parseCoordinates(row.coordonneesXY);
  const finalLng = lng ?? fallback?.[0] ?? null;
  const finalLat = lat ?? fallback?.[1] ?? null;
  if (finalLat == null || finalLng == null) return;
  if (Math.abs(finalLat) > 90 || Math.abs(finalLng) > 180) return;

  // Which id actually identifies the *station* varies by publisher, and getting
  // this wrong is the difference between one pin and one pin per plug.
  //
  //  * "Non concerné" (not applicable) appears for non-roaming stations. Using
  //    it would merge every such station in France into one.
  //  * Some publishers write the charge-point id into the station columns —
  //    eco-movement's rows read
  //      id_station_itinerance=ATHTBE1012061, id_pdc_itinerance=ATHTBE1012061
  //      id_station_itinerance=ATHTBE1012062, id_pdc_itinerance=ATHTBE1012062
  //    for three plugs of one forecourt. Grouping on that yields three
  //    stations at one coordinate, which is exactly the tripling reported from
  //    the field. Equality with the pdc id is the tell.
  const stationId = (row.id_station_itinerance ?? "").trim();
  const localId = (row.id_station_local ?? "").trim();
  const pdcId = (row.id_pdc_itinerance ?? "").trim();
  const isPerPoint = (id: string) => id.length === 0 || (pdcId.length > 0 && id === pdcId);

  const usableStationId = !isPerPoint(stationId) && !/^non concern/i.test(stationId)
    ? stationId
    : !isPerPoint(localId)
      ? localId
      : null;

  // No usable station id: fall back to the site itself. Rounded to ~11 m and
  // keyed by operator, so two networks sharing a forecourt stay apart while one
  // network's plugs collapse into the station they belong to.
  const ref =
    usableStationId ||
    `${(row.nom_operateur || row.nom_enseigne || "?").trim().toLowerCase()}@${finalLat.toFixed(4)},${finalLng.toFixed(4)}`;

  let station = stations.get(ref);
  if (!station) {
    station = {
      ref,
      lat: finalLat,
      lng: finalLng,
      name: (row.nom_station || row.nom_enseigne || "").trim() || null,
      operator: (row.nom_operateur || row.nom_enseigne || "").trim() || null,
      street: (row.adresse_station || "").trim() || null,
      postcode: (row.consolidated_code_postal || "").trim() || null,
      city: (row.consolidated_commune || "").trim() || null,
      connectors: new Map(),
    };
    stations.set(ref, station);
  }

  const powerKw = toNumber(row.puissance_nominale);
  for (const [column, type] of CONNECTOR_COLUMNS) {
    if (!isTrue(row[column])) continue;
    const existing = station.connectors.get(type);
    if (existing) {
      existing.count += 1;
      if (powerKw != null && (existing.powerKw == null || powerKw > existing.powerKw)) {
        existing.powerKw = powerKw;
      }
    } else {
      station.connectors.set(type, { powerKw, count: 1 });
    }
  }
}

function toRawCharger(s: StationAccumulator): RawCharger {
  const connectors: ChargerConnector[] = [...s.connectors.entries()].map(
    ([type, { powerKw, count }]) => ({ type, powerKw, count }),
  );

  return {
    source: "irve",
    sourceRef: s.ref,
    lat: s.lat,
    lng: s.lng,
    name: s.name,
    operator: s.operator,
    address: {
      street: s.street,
      city: s.city,
      region: null,
      postcode: s.postcode,
      country: "FR",
    },
    connectors,
    pricing: null,
  };
}

/**
 * Fold the CSV into stations, one line at a time.
 *
 * Exported for the tests: it is the whole of the mapping, and feeding it a
 * handful of real lines is far more useful than mocking a 163 MB download.
 */
export async function* csvLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        yield buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (buffer.length > 0) yield buffer.replace(/\r$/, "");
}

export async function stationsFromCsv(
  stream: ReadableStream<Uint8Array>,
): Promise<RawCharger[]> {
  const stations = new Map<string, StationAccumulator>();
  let header: string[] | null = null;

  for await (const line of csvLines(stream)) {
    if (line.length === 0) continue;
    const fields = parseCsvLine(line);
    if (!header) {
      header = fields;
      continue;
    }
    // A quoted field containing a newline would split across lines; the
    // consolidated export does not produce those, and a short row is skipped
    // rather than mis-indexed.
    if (fields.length < header.length) continue;

    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]!] = fields[i] ?? "";
    accumulate(stations, row);
  }

  return [...stations.values()].map(toRawCharger);
}

// Per-tile fetching is deliberately not supported: see the note at the top.
async function fetchTile(_bbox: BBox): Promise<RawCharger[]> {
  return [];
}

export const irveConnector: SourceConnector = { id: "irve", fetchTile };

/** Full-country import. Called by the scheduled bulk job, never by a page. */
export async function fetchCountryFr(): Promise<RawCharger[]> {
  try {
    const res = await fetch(IRVE_URL, {
      headers: { Accept: "text/csv" },
      // 163 MB took 11.4 s from Vercel; allow for a slow day.
      signal: AbortSignal.timeout(120_000),
      redirect: "follow",
    });
    if (!res.ok) {
      recordDebugLog("error", "irve", `fetch ${res.status}`);
      return [];
    }
    if (!res.body) {
      recordDebugLog("error", "irve", "response had no body");
      return [];
    }
    return await stationsFromCsv(res.body);
  } catch (err) {
    recordDebugLog("error", "irve", "fetch failed:", {
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
