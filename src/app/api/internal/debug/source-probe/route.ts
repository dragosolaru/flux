import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// Fetches a charger source's upstream URL and reports what actually comes back.
//
// The existing /probe runs the connectors and counts rows, which tells you a
// source returned nothing but not why. Fixing a broken connector needs the raw
// response: IRVE logs `Unexpected token 'o', "nom_amenage"... is not valid
// JSON`, which says the body starts with a CSV header, but not which columns it
// has; NDW returns 400, which says the request is malformed but not which
// parameter it dislikes.
//
// NOT a URL proxy. The client sends a source id and nothing else; every URL is
// fixed here, server-side. Allowing a caller-supplied URL would make this an
// SSRF hole straight into the deployment's network.
export const maxDuration = 60;

const MAX_BODY_CHARS = 4000;

const SOURCES: Record<string, { url: string; accept: string; note: string }> = {
  irve: {
    url: "https://www.data.gouv.fr/fr/datasets/r/eb76d20a-8501-400e-b336-d85724de5435",
    accept: "application/geo+json,application/json",
    note: "data.gouv.fr consolidated IRVE resource — the connector expects GeoJSON",
  },
  ndw: {
    url: "https://dotnl.ndw.nu/api/rest/geojson/dynamic-road-status/charge-point-data/v1/features?bbox=4.8,52.3,4.95,52.4",
    accept: "application/json",
    note: "NDW charge-point GeoJSON, small Amsterdam bbox",
  },
  "ndw-nobbox": {
    url: "https://dotnl.ndw.nu/api/rest/geojson/dynamic-road-status/charge-point-data/v1/features",
    accept: "application/json",
    note: "Same NDW endpoint with no bbox — distinguishes a bad parameter from a dead path",
  },
  bnetza: {
    url: "https://ladestationen.api.bund.dev/",
    accept: "application/json",
    note: "BNetzA — 404 on every request since before this panel existed",
  },
  "bnetza-openapi": {
    url: "https://ladestationen.api.bund.dev/openapi.yaml",
    accept: "text/yaml,application/yaml,text/plain",
    note: "The bund.dev base URL serves Swagger UI, not data — this is the spec it loads, which names the real endpoint",
  },
  austria: {
    url: "https://gis.bgld.gv.at/arcgis/rest/services/Fachdaten/Ladestationen/MapServer/0/query?where=1%3D1&outFields=*&f=json&resultRecordCount=1",
    accept: "application/json",
    note: "Burgenland ArcGIS — regional, not a national register",
  },
};

const BodySchema = z.object({ source: z.enum(Object.keys(SOURCES) as [string, ...string[]]) });

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  if (!(await checkRateLimit(admin.userId, "debug-source-probe", 60))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: `Unknown source. Known: ${Object.keys(SOURCES).join(", ")}` },
      { status: 422 },
    );
  }

  const target = SOURCES[parsed.data.source];
  const startedAt = Date.now();

  try {
    const res = await fetch(target.url, {
      headers: { Accept: target.accept },
      signal: AbortSignal.timeout(30_000),
      redirect: "follow",
    });

    // Read as text, never JSON: the whole point is to see a body that failed to
    // parse as JSON.
    const body = await res.text();

    return NextResponse.json({
      source: parsed.data.source,
      note: target.note,
      url: target.url,
      status: res.status,
      contentType: res.headers.get("content-type"),
      finalUrl: res.url,
      totalChars: body.length,
      ms: Date.now() - startedAt,
      // The head is enough to identify the format and, for CSV, the columns.
      head: body.slice(0, MAX_BODY_CHARS),
    });
  } catch (err) {
    return NextResponse.json({
      source: parsed.data.source,
      note: target.note,
      url: target.url,
      status: null,
      ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
