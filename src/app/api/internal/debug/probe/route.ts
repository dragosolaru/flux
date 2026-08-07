import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  ocmConnector,
  overpassConnector,
  bnetzaConnector,
  ndwConnector,
  tomtomConnector,
  austriaConnector,
  irveConnector,
} from "@/lib/chargers/ingest";
import type { BBox, RawCharger, SourceConnector } from "@/lib/chargers/types";

// Queries each source on its own for one area and reports what came back,
// without writing anything. The combined ingest hides which source produced
// what — a connector that returns nothing is indistinguishable from an area
// with no chargers once the results are merged.
export const maxDuration = 60;

const CONNECTORS: SourceConnector[] = [
  ocmConnector,
  overpassConnector,
  tomtomConnector,
  bnetzaConnector,
  ndwConnector,
  austriaConnector,
  irveConnector,
];

const BodySchema = z.object({
  minLat: z.number().min(-90).max(90),
  minLng: z.number().min(-180).max(180),
  maxLat: z.number().min(-90).max(90),
  maxLng: z.number().min(-180).max(180),
});

interface ProbeResult {
  source: string;
  count: number;
  ms: number;
  withOperator: number;
  withCountry: number;
  withPower: number;
  sample: { name: string | null; operator: string | null; country: string | null } | null;
}

function summarise(id: string, rows: RawCharger[], ms: number): ProbeResult {
  const first = rows[0] ?? null;
  return {
    source: id,
    count: rows.length,
    ms,
    withOperator: rows.filter((r) => r.operator != null).length,
    withCountry: rows.filter((r) => r.address.country != null).length,
    withPower: rows.filter((r) => r.connectors.some((c) => c.powerKw != null)).length,
    sample: first
      ? { name: first.name, operator: first.operator, country: first.address.country }
      : null,
  };
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ message: "Not found" }, { status: 404 });

  if (!(await checkRateLimit(admin.userId, "debug-probe", 60))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid body" }, { status: 422 });
  }

  const { minLat, minLng, maxLat, maxLng } = parsed.data;
  if (minLat >= maxLat || minLng >= maxLng) {
    return NextResponse.json({ message: "Empty bbox" }, { status: 422 });
  }
  // Small area on purpose: this is a diagnostic, not an import.
  if ((maxLat - minLat) * (maxLng - minLng) > 4) {
    return NextResponse.json({ message: "Probe area too large (max 4 sq deg)" }, { status: 422 });
  }

  const bbox: BBox = { minLat, minLng, maxLat, maxLng };

  const results = await Promise.all(
    CONNECTORS.map(async (connector) => {
      const startedAt = Date.now();
      try {
        const rows = await connector.fetchTile(bbox);
        return summarise(connector.id, rows, Date.now() - startedAt);
      } catch (err) {
        return {
          ...summarise(connector.id, [], Date.now() - startedAt),
          error: err instanceof Error ? err.message : "failed",
        };
      }
    }),
  );

  return NextResponse.json({ bbox, results });
}
