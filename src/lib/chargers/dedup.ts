// Dedup + merge for charger ingestion. Pure, dependency-free, I/O-free so it is
// trivially unit-testable. Raw chargers from multiple sources are clustered into
// canonical chargers via a weighted match score, merging fields by source
// priority. See Section 3 of the charger data platform spec.

import { computeConfidence } from "./confidence";
import type {
  Charger,
  ChargerAvailability,
  ChargerConnector,
  ChargerSourceRef,
  RawCharger,
} from "./types";

export interface ChargerCluster {
  lat: number;
  lng: number;
  name: string | null;
  operator: string | null;
  operatorId: string | null;
  address: Charger["address"];
  connectors: ChargerConnector[];
  maxPowerKw: number | null;
  pricing: Charger["pricing"];
  availability: ChargerAvailability;
  sources: ChargerSourceRef[];
  confidence: number;
  matchedExistingId: string | null;
}

// A more informative status wins when merging co-located records. unknown is
// the weakest signal; an explicit operational/offline beats a stale one.
const AVAILABILITY_RANK: Record<ChargerAvailability, number> = {
  unknown: 0,
  stale: 1,
  offline: 2,
  operational: 3,
};

function mergeAvailability(
  a: ChargerAvailability,
  b: ChargerAvailability,
): ChargerAvailability {
  return AVAILABILITY_RANK[b] > AVAILABILITY_RANK[a] ? b : a;
}

const MATCH_THRESHOLD = 0.6;
const MATCH_RADIUS_M = 60;
const MATCH_DECAY_M = 150;
// Records this close are the same physical site. OCM frequently has duplicate
// community submissions at one coordinate; without this they each fall below the
// match threshold (spatial weight alone is < threshold) and stack on the map as
// a single spiderfied point instead of merging into one charger.
const SAME_SITE_M = 40;
// Radius within which hardware agreement may override a disagreement about the
// operator's name. Tight on purpose: this is the span of a single bank of
// stalls, where three sources describing one site land, and where two different
// networks do not.
const NAME_OVERRIDE_M = 15;

// Match-score weights. Spatial proximity dominates because two records at the
// same coordinates are almost certainly the same physical site; the other
// signals disambiguate co-located stations (e.g. two operators in one car park).
const W_SPATIAL = 0.5;
const W_OPERATOR = 0.2;
const W_CONNECTOR = 0.2;
const W_NAME = 0.1;

/** Great-circle distance between two WGS84 points, in meters. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function slugify(value: string | null): string | null {
  if (!value) return null;
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : null;
}

function tokens(value: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Jaccard overlap of token sets — 1 identical, 0 disjoint. */
function tokenOverlap(a: string | null, b: string | null): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * True when one operator's tokens are fully contained in the other's — the same
 * network written two ways ("Tesla" / "Tesla Supercharger", "Shell" / "Shell
 * Recharge"). Plain edit distance scores these far apart because the suffix
 * dominates the length. Requires ≥4 chars on the shorter side so a generic
 * fragment can't swallow an unrelated operator.
 */
function operatorContained(a: string | null, b: string | null): boolean {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  const smallLen = [...small].join("").length;
  // 5 chars, not 4: a 4-letter generic word ("Park", "Volt") is not a brand and
  // would otherwise be absorbed by every superset name ("Park & Charge",
  // "Volt Mobility"). Real short brands here — Shell, Tesla, Enel — reach 5.
  if (smallLen < 5) return false;
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

/**
 * Words that describe a charger rather than name a business. A shared brand
 * token is treated as evidence two records are the same site, so a token that
 * half the chargers in Europe carry must not count as one.
 *
 * Length alone does not filter these: "charging" and "station" are longer than
 * "shell" and "tesla".
 */
const GENERIC_BRAND_TOKENS = new Set([
  "charge", "charger", "chargers", "charging", "chargepoint", "charhing",
  "station", "stations", "point", "points", "plug", "socket", "outlet",
  "power", "energy", "electric", "electrical", "mobility", "emobility",
  "public", "private", "parking", "garage", "hotel", "restaurant", "market",
  "supermarket", "center", "centre", "centrum", "plaza", "mall", "store",
  "petrol", "fuel", "service", "services", "motorway", "highway", "north",
  "south", "east", "west", "rapid", "fast", "ultra", "super", "recharge",
  "network", "group", "limited", "gmbh", "srl", "sa", "bv", "ltd",
]);

/**
 * Brand-ish tokens of a record, drawn from BOTH its name and its operator.
 *
 * Sources disagree about which field holds what: OCM submissions put the
 * network in `operator` and the host business in `name` about as often as the
 * reverse. Reading only one field is what makes two records of one site look
 * like two networks.
 *
 * ≥5 chars, matching operatorContained's rule and for the same reason: a short
 * generic fragment is not a brand, while real short brands (Shell, Tesla,
 * Enel, PlugQ) reach 5.
 */
function brandTokens(name: string | null, operator: string | null): Set<string> {
  const out = new Set<string>();
  for (const t of [...tokens(name), ...tokens(operator)]) {
    if (t.length >= 5 && !GENERIC_BRAND_TOKENS.has(t)) out.add(t);
  }
  return out;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

/**
 * True when one record's declared OPERATOR appears in the other's name or
 * operator — the same business written into different fields.
 *
 * Deliberately not a plain name↔name overlap: two unrelated stations in one
 * village both carry the village in their name ("… Nea Kerdilia"), and merging
 * on that would collapse genuinely separate sites. Requiring the shared token
 * to be somebody's declared operator makes it a claim about the network, which
 * a place name is not.
 *
 * Reported from the field (Nea Kerdilia, GR): OCM holds the same site as
 * `name: "SHELL Nea Kerdilia" / operator: "NRGincharge"` and
 * `name: "nrg - Shell" / operator: "Shell ΠΑΡΑΣΚΕΥΟΠΟΥΛΟΣ"`. Operator-to-operator
 * similarity is ~0.09 — the Greek host name slugifies to "shell", nothing like
 * "nrgincharge" — so the pair read as two networks and drew two pins. Both
 * records name Shell; only the field differs.
 */
function sharesOperatorBrand(
  a: { name: string | null; operator: string | null },
  b: { name: string | null; operator: string | null },
): boolean {
  const aOperator = brandTokens(null, a.operator);
  const bOperator = brandTokens(null, b.operator);
  const aAll = brandTokens(a.name, a.operator);
  const bAll = brandTokens(b.name, b.operator);
  return intersects(aOperator, bAll) || intersects(bOperator, aAll);
}

/** Operator similarity: exact slug match is strong; otherwise normalized edit distance. */
function operatorSimilarity(a: string | null, b: string | null): number {
  const sa = slugify(a);
  const sb = slugify(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  if (operatorContained(a, b)) return 1;
  const dist = levenshtein(sa, sb);
  const maxLen = Math.max(sa.length, sb.length);
  return maxLen === 0 ? 0 : Math.max(0, 1 - dist / maxLen);
}

function connectorFingerprint(c: ChargerConnector): string {
  return `${c.type}:${roundPower(c.powerKw)}`;
}

function roundPower(powerKw: number | null): number {
  return powerKw == null ? 0 : Math.round(powerKw);
}

/** Jaccard overlap of connector type+rounded-power fingerprints. */
function connectorOverlap(
  a: ChargerConnector[],
  b: ChargerConnector[],
): number {
  const sa = new Set(a.map(connectorFingerprint));
  const sb = new Set(b.map(connectorFingerprint));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const f of sa) if (sb.has(f)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function spatialScore(distanceM: number): number {
  if (distanceM <= MATCH_RADIUS_M) return 1;
  if (distanceM >= MATCH_DECAY_M) return 0;
  return 1 - (distanceM - MATCH_RADIUS_M) / (MATCH_DECAY_M - MATCH_RADIUS_M);
}

export function matchScore(
  raw: RawCharger,
  candidate: {
    lat: number;
    lng: number;
    operator: string | null;
    connectors: ChargerConnector[];
    name: string | null;
  },
): number {
  const distanceM = haversineMeters(raw, candidate);
  const operator = operatorSimilarity(raw.operator, candidate.operator);

  // Two records that both name an operator, and name clearly different ones,
  // are different networks — never merge them at ANY distance. Applying this
  // only inside SAME_SITE_M made the score non-monotonic: a pair scored 0 at
  // 39 m but ~0.83 at 50 m, where spatial+connector+name alone clear the
  // threshold. Motorway service areas hosting two operators tens of metres
  // apart are exactly the case that has to survive dedup.
  //
  // Compared on raw strings, not slugs: slugify() strips non-Latin scripts to
  // null, and treating that as "unknown operator" would let a Greek- or
  // Cyrillic-named station merge into any co-located one.
  const bothNamed = raw.operator != null && candidate.operator != null;

  // Standing on one site, a disagreement about the operator's NAME is weaker
  // evidence than agreement about the hardware. Sources routinely attribute the
  // same charge point differently — the network on one ("PlugQ"), the fuel
  // station hosting it on another ("Jet Oil ΚΟΥΤΣΙΜΑΝΗ") — and vetoing on that
  // alone drew one Greek site as three pins.
  //
  // Two records at the same coordinate carrying the same connectors, or the
  // same rated power, are the same physical kit under two names. Preferring to
  // merge here is also the cheaper mistake: one pin where there should be two
  // still gets the driver to a working charger, while three pins for one site
  // corrupts the count and lets the planner treat one stop as three.
  const sameHardware = (): boolean => {
    if (connectorOverlap(raw.connectors, candidate.connectors) >= 0.5) return true;
    const a = maxPowerOf(raw.connectors);
    const b = maxPowerOf(candidate.connectors);
    return a != null && b != null && Math.round(a) === Math.round(b);
  };

  // A cross-field brand agreement retracts the veto rather than overriding it
  // at close range: the two records were never claiming different networks, so
  // there is no conflict to override and the ordinary scoring applies at every
  // distance. Corroborated by the hardware, because the brand token alone would
  // let a Shell-hosted Ionity bay absorb the Shell Recharge bay beside it —
  // same host, genuinely different networks, and they run different kit.
  const namesConflict =
    bothNamed &&
    operator < 0.5 &&
    !(sharesOperatorBrand(raw, candidate) && sameHardware());

  if (distanceM <= SAME_SITE_M) {
    if (!namesConflict) return 1;
    // Overriding a name conflict needs BOTH a much tighter radius and matching
    // hardware. Matching hardware alone is weak — CCS at 150 kW is a stock
    // configuration two unrelated networks will both have — so it only counts
    // inside one bay cluster, where separate operators do not realistically
    // co-locate. At 39 m two named networks stay apart; that is a motorway
    // service area, not one site described twice.
    return distanceM <= NAME_OVERRIDE_M && sameHardware() ? 1 : 0;
  }

  // Past the same-site radius the name conflict is decisive again — this is
  // what keeps two operators sharing a service area from collapsing, and keeps
  // the score from rising with distance.
  if (namesConflict) return 0;

  const spatial = spatialScore(distanceM);
  const connector = connectorOverlap(raw.connectors, candidate.connectors);
  const name = tokenOverlap(raw.name, candidate.name);
  return (
    W_SPATIAL * spatial +
    W_OPERATOR * operator +
    W_CONNECTOR * connector +
    W_NAME * name
  );
}

// Discovery sources ranked for core-field priority. Lower index wins.
const CORE_PRIORITY: RawCharger["source"][] = ["ocm", "tomtom", "osm", "bnetza", "ndw", "austria", "irve", "chargeprice"];

function corePriority(source: RawCharger["source"]): number {
  const idx = CORE_PRIORITY.indexOf(source);
  return idx === -1 ? CORE_PRIORITY.length : idx;
}

function addressCompleteness(address: Charger["address"]): number {
  return Object.values(address).filter((v) => v != null && v !== "").length;
}

// Merge two addresses field-by-field: each non-null field of `primary` wins, with
// `secondary` filling the gaps. Used so the authoritative/fresh source's address
// overwrites our stored one — when an address is corrected upstream (OCM), the
// change propagates on the next ingest instead of being pinned to the old value.
function preferAddress(
  primary: Charger["address"],
  secondary: Charger["address"],
): Charger["address"] {
  return {
    street: primary.street ?? secondary.street,
    city: primary.city ?? secondary.city,
    region: primary.region ?? secondary.region,
    country: primary.country ?? secondary.country,
    postcode: primary.postcode ?? secondary.postcode,
  };
}

function maxPowerOf(connectors: ChargerConnector[]): number | null {
  const powered = connectors
    .map((c) => c.powerKw)
    .filter((p): p is number => p != null);
  return powered.length > 0 ? Math.max(...powered) : null;
}

function mergeConnectors(
  existing: ChargerConnector[],
  incoming: ChargerConnector[],
): ChargerConnector[] {
  const byKey = new Map<string, ChargerConnector>();
  for (const c of existing) byKey.set(connectorFingerprint(c), { ...c });
  for (const c of incoming) {
    const key = connectorFingerprint(c);
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, { ...prev, count: Math.max(prev.count, c.count) });
    } else {
      byKey.set(key, { ...c });
    }
  }
  return [...byKey.values()];
}

interface ClusterState {
  cluster: ChargerCluster;
  bestCorePriority: number;
  operatorSlugs: Set<string>;
  maxPowers: number[];
}

function newClusterFromRaw(
  raw: RawCharger,
  matchedExistingId: string | null,
): ClusterState {
  const cluster: ChargerCluster = {
    lat: raw.lat,
    lng: raw.lng,
    name: raw.name,
    operator: raw.operator,
    operatorId: slugify(raw.operator),
    address: { ...raw.address },
    connectors: raw.connectors.map((c) => ({ ...c })),
    maxPowerKw: maxPowerOf(raw.connectors),
    pricing: raw.source === "chargeprice" ? raw.pricing : null,
    availability: raw.availability ?? "unknown",
    sources: [{ source: raw.source, ref: raw.sourceRef }],
    confidence: 0,
    matchedExistingId,
  };
  const slug = slugify(raw.operator);
  const power = maxPowerOf(raw.connectors);
  return {
    cluster,
    bestCorePriority: corePriority(raw.source),
    operatorSlugs: slug ? new Set([slug]) : new Set(),
    maxPowers: power != null ? [power] : [],
  };
}

/**
 * Record a source ref on a cluster, at most once.
 *
 * The definite-match path seeds a cluster from an existing charger — whose
 * sources already contain the very ref that matched — and then merges that same
 * raw in. Pushing unconditionally left the pair listed twice, and the batch
 * upsert inserts sources with ON CONFLICT DO UPDATE: two identical rows in one
 * statement raise "ON CONFLICT DO UPDATE command cannot affect row a second
 * time", which aborts the whole RPC. Every chunk of up to 200 clusters was lost,
 * surfacing as "all upserts failed" on re-ingest of an already-stored area
 * while a first ingest of a cold area succeeded.
 */
function addSource(
  cluster: ChargerCluster,
  source: RawCharger["source"],
  ref: string,
): void {
  if (cluster.sources.some((s) => s.source === source && s.ref === ref)) return;
  cluster.sources.push({ source, ref });
}

function mergeRawIntoCluster(state: ClusterState, raw: RawCharger): void {
  const { cluster } = state;
  const priority = corePriority(raw.source);

  // Core fields follow source priority: a higher-priority (or equally
  // authoritative, fresher) source overwrites so upstream corrections to
  // location/name/operator/address propagate to our stored charger.
  if (priority <= state.bestCorePriority) {
    cluster.lat = raw.lat;
    cluster.lng = raw.lng;
    if (raw.name) cluster.name = raw.name;
    if (raw.operator) {
      cluster.operator = raw.operator;
      cluster.operatorId = slugify(raw.operator);
    }
    // Authoritative source's fields win; existing values fill any gaps.
    cluster.address = preferAddress(raw.address, cluster.address);
    state.bestCorePriority = priority;
  } else {
    if (!cluster.name && raw.name) cluster.name = raw.name;
    if (!cluster.operator && raw.operator) {
      cluster.operator = raw.operator;
      cluster.operatorId = slugify(raw.operator);
    }
    // Lower-priority source only fills fields the authoritative one left empty.
    cluster.address = preferAddress(cluster.address, raw.address);
  }

  cluster.connectors = mergeConnectors(cluster.connectors, raw.connectors);
  cluster.maxPowerKw = maxPowerOf(cluster.connectors);

  // Pricing only from a chargeprice source.
  if (raw.source === "chargeprice" && raw.pricing) cluster.pricing = raw.pricing;

  cluster.availability = mergeAvailability(cluster.availability, raw.availability ?? "unknown");

  addSource(cluster, raw.source, raw.sourceRef);

  const slug = slugify(raw.operator);
  if (slug) state.operatorSlugs.add(slug);
  const power = maxPowerOf(raw.connectors);
  if (power != null) state.maxPowers.push(power);
}

function distinctSourceCount(sources: ChargerSourceRef[]): number {
  return new Set(sources.map((s) => s.source)).size;
}

function hasConflict(state: ClusterState): boolean {
  if (state.operatorSlugs.size > 1) return true;
  if (state.maxPowers.length > 1) {
    const min = Math.min(...state.maxPowers);
    const max = Math.max(...state.maxPowers);
    if (min > 0 && (max - min) / min > 0.5) return true;
  }
  return false;
}

function existingMatchKey(charger: Charger): Set<string> {
  return new Set(charger.sources.map((s) => `${s.source}:${s.ref}`));
}

export function clusterChargers(
  raws: RawCharger[],
  existing: Charger[],
): ChargerCluster[] {
  const states: ClusterState[] = [];

  const existingKeys = existing.map(
    (c) => [c, existingMatchKey(c)] as const,
  );

  for (const raw of raws) {
    const rawKey = `${raw.source}:${raw.sourceRef}`;

    // Definite match: this exact source ref already lives in an existing charger.
    const definite = existingKeys.find(([, keys]) => keys.has(rawKey));
    if (definite) {
      const [charger] = definite;
      const found = states.find((s) => s.cluster.matchedExistingId === charger.id);
      if (found) {
        mergeRawIntoCluster(found, raw);
      } else {
        states.push(seedFromExisting(charger, raw));
      }
      continue;
    }

    let bestState: ClusterState | null = null;
    let bestExisting: Charger | null = null;
    let bestScore = MATCH_THRESHOLD;

    for (const state of states) {
      const score = matchScore(raw, {
        lat: state.cluster.lat,
        lng: state.cluster.lng,
        operator: state.cluster.operator,
        connectors: state.cluster.connectors,
        name: state.cluster.name,
      });
      if (score >= bestScore) {
        bestScore = score;
        bestState = state;
        bestExisting = null;
      }
    }

    for (const [charger] of existingKeys) {
      // Skip an existing charger already represented by an in-batch cluster.
      if (states.some((s) => s.cluster.matchedExistingId === charger.id)) continue;
      const score = matchScore(raw, {
        lat: charger.lat,
        lng: charger.lng,
        operator: charger.operator,
        connectors: charger.connectors,
        name: charger.name,
      });
      if (score >= bestScore) {
        bestScore = score;
        bestExisting = charger;
        bestState = null;
      }
    }

    if (bestState) {
      mergeRawIntoCluster(bestState, raw);
    } else if (bestExisting) {
      states.push(seedFromExisting(bestExisting, raw));
    } else {
      states.push(newClusterFromRaw(raw, null));
    }
  }

  for (const state of states) {
    state.cluster.confidence = computeConfidence({
      sourceCount: distinctSourceCount(state.cluster.sources),
      hasOperator: state.cluster.operator != null,
      hasPoweredConnector: state.cluster.connectors.some(
        (c) => c.powerKw != null && c.powerKw > 0,
      ),
      hasAddress: addressCompleteness(state.cluster.address) > 0,
      conflict: hasConflict(state),
    });
  }

  return states.map((s) => s.cluster);
}

function seedFromExisting(charger: Charger, raw: RawCharger | null): ClusterState {
  const cluster: ChargerCluster = {
    lat: charger.lat,
    lng: charger.lng,
    name: charger.name,
    operator: charger.operator,
    operatorId: charger.operatorId,
    address: { ...charger.address },
    connectors: charger.connectors.map((c) => ({ ...c })),
    maxPowerKw: charger.maxPowerKw,
    pricing: charger.pricing,
    availability: charger.availability,
    sources: charger.sources.map((s) => ({ ...s })),
    confidence: charger.confidence,
    matchedExistingId: charger.id,
  };
  const slugs = new Set<string>();
  const existingSlug = slugify(charger.operator);
  if (existingSlug) slugs.add(existingSlug);
  const maxPowers: number[] = [];
  if (charger.maxPowerKw != null) maxPowers.push(charger.maxPowerKw);

  // Existing canonicals predate this batch; treat their best source as the
  // baseline core priority so an incoming higher-priority source can still win.
  const bestCorePriority = charger.sources.reduce(
    (acc, s) => Math.min(acc, corePriority(s.source)),
    CORE_PRIORITY.length,
  );

  const state: ClusterState = {
    cluster,
    bestCorePriority,
    operatorSlugs: slugs,
    maxPowers,
  };
  if (raw) mergeRawIntoCluster(state, raw);
  return state;
}
