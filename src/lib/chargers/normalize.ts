import type { ChargerConnector, ConnectorType } from "./types";

// OCM connection-type IDs → canonical connector. IDs from the OpenChargeMap
// reference list (https://api.openchargemap.io/v3/referencedata).
const OCM_CONNECTION_TYPE_IDS: Record<number, ConnectorType> = {
  1: "type1", // J1772
  2: "chademo",
  25: "type2", // Type 2 (Socket Only)
  1036: "type2", // Type 2 (Tethered Connector)
  27: "tesla", // Tesla (Roadster)
  30: "tesla", // Tesla Supercharger
  31: "ccs1", // CCS (Type 1)
  32: "ccs2", // CCS (Type 2)
  28: "schuko", // Schuko (Europe)
  33: "type1", // LP Inductive
};

function normalizeKey(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}

export function canonicalConnectorType(input: string | number): ConnectorType {
  if (typeof input === "number") {
    return OCM_CONNECTION_TYPE_IDS[input] ?? "other";
  }

  const key = normalizeKey(input);

  // Order matters: combo/CCS checks must precede the plain type2/type1 checks.
  // TomTom uses "IEC62196Type2CCS" (type token before "ccs"), so match ccs on
  // either side of the type token.
  if (/ccs.*type\s*2|type\s*2.*ccs|type\s*2.*combo|ccs2|combo\s*2|combined.*type\s*2/.test(key)) {
    return "ccs2";
  }
  if (/ccs.*type\s*1|type\s*1.*ccs|ccs1|combo\s*1/.test(key)) return "ccs1";
  if (/\bccs\b|combined charging/.test(key)) return "ccs2";
  if (/chademo/.test(key)) return "chademo";
  if (/tesla|supercharger/.test(key)) return "tesla";
  if (/type\s*2|type2|mennekes|iec.*62196.*2/.test(key)) return "type2";
  if (/type\s*1|type1|j1772|j-1772/.test(key)) return "type1";
  if (/schuko|domestic|household|cee|wall.*outlet/.test(key)) return "schuko";

  return "other";
}

export function parsePowerKw(
  raw: string | number | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  const match = /(\d+(?:\.\d+)?)\s*(kw|w)?/i.exec(raw);
  if (!match) return null;

  const val = parseFloat(match[1]!);
  if (!Number.isFinite(val)) return null;

  const unit = match[2]?.toLowerCase();
  if (unit === "kw") return val;
  if (unit === "w") return val / 1000;
  // Bare number: large values are watts (OSM frequently stores "150000").
  return val > 1000 ? val / 1000 : val;
}

const OPERATOR_ALIASES: Record<string, string> = {
  ionity: "ionity",
  "ionity gmbh": "ionity",
  tesla: "tesla",
  "tesla inc": "tesla",
  "tesla motors": "tesla",
  "enel x": "enel-x",
  "enel x way": "enel-x",
  allego: "allego",
  fastned: "fastned",
  "fastned b v": "fastned",
  "shell recharge": "shell-recharge",
  "e on": "eon",
  eon: "eon",
};

export function slugifyOperator(name: string | null): string | null {
  if (name === null) return null;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") return null;

  // Alias lookup uses an alnum-only space-normalized key so punctuation
  // variants ("Tesla, Inc." / "Tesla Inc") collapse to one entry.
  const aliasKey = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return OPERATOR_ALIASES[aliasKey] ?? slug;
}

/** Combine connectors sharing the same type+power, summing their counts. */
export function mergeConnectors(
  connectors: ChargerConnector[],
): ChargerConnector[] {
  const byKey = new Map<string, ChargerConnector>();
  for (const c of connectors) {
    const key = `${c.type}|${c.powerKw ?? ""}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += c.count;
    } else {
      byKey.set(key, { ...c });
    }
  }
  return Array.from(byKey.values());
}
