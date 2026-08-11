import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function escapeIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * An iCalendar DATE value: exactly YYYYMMDD.
 *
 * Sliced to ten characters first. `valid_until` is AI-extracted, so it can
 * arrive as a full timestamp, and `2027-04-30T00:00:00Z` became
 * `20270430T00:00:00Z` — colons are the property/parameter separator in
 * iCalendar, so that one value corrupts the rest of the file for the importer.
 * Returns null rather than emitting a broken event.
 */
function toIcalDate(iso: string): string | null {
  const date = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date.replace(/-/g, "");
}

/**
 * DTEND for an all-day event is EXCLUSIVE — RFC 5545 §3.6.1.
 *
 * DTSTART and DTEND on the same date is a zero-length event, which Google
 * Calendar and Apple Calendar each render differently and neither renders as
 * "this day". The end is the day after.
 */
function nextDay(yyyymmdd: string): string {
  const d = new Date(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8)) + 1,
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

const TYPE_LABELS: Record<string, string> = {
  rca: "RCA", casco: "CASCO", itp: "ITP", rovinieta: "Rovinieta",
  vignette: "Vignette", leasing: "Leasing", roadside_assistance: "Roadside Assistance",
  car_tax: "Car Tax", talon: "Registration",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId } = await params;
  if (!z.string().uuid().safeParse(vehicleId).success) {
    return NextResponse.json({ message: "Invalid vehicleId" }, { status: 400 });
  }

  if (!(await checkRateLimit(session.user.id, "vault-read", 300))) {
    return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();

  // display_name. `name` and `plate_number` have never existed on this table —
  // PostgREST answers a select on an unknown column with an error and no rows,
  // so this route returned 404 unconditionally and the ICS export has never
  // worked once. The plate lives on vehicle_doc_meta, which is already read
  // below, so there is nothing to join here.
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, display_name")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (vehicleError || !vehicle) {
    return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });
  }

  const vehicleLabel = (vehicle as { display_name?: string | null }).display_name ?? "Vehicle";

  const [{ data: metas }, { data: docs }] = await Promise.all([
    supabase
      .from("vehicle_doc_meta")
      .select("document_id, valid_until, plate_number")
      .eq("vehicle_id", vehicleId)
      .not("valid_until", "is", null),
    supabase
      .from("documents")
      .select("id, document_type, parsed_json")
      .eq("vehicle_id", vehicleId)
      .eq("user_id", session.user.id)
      .eq("status", "done")
      .not("document_type", "is", null),
  ]);

  type MetaRow = { document_id: string; valid_until: string; plate_number: string | null };
  const metaMap = new Map<string, MetaRow>((metas ?? []).map((m: MetaRow) => [m.document_id, m]));

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const events: string[] = [];

  for (const doc of docs ?? []) {
    const meta = metaMap.get(doc.id);
    const validUntil = meta?.valid_until
      ?? (doc.parsed_json as Record<string, unknown> | null)?.valid_until as string | null;
    if (!validUntil) continue;

    const start = toIcalDate(validUntil);
    if (!start) continue;

    const label = TYPE_LABELS[doc.document_type as string] ?? (doc.document_type as string ?? "Document");
    const plate = meta?.plate_number
      ?? (doc.parsed_json as Record<string, unknown> | null)?.plate_number as string | null
      ?? vehicleLabel;
    const summary = escapeIcal(`${label} expires — ${plate}`);
    const uid = `${doc.id}@flux.app`;

    events.push([
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${nextDay(start)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:Flux vehicle document vault reminder`,
      "BEGIN:VALARM",
      "TRIGGER:-P30D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${summary} — 30 days remaining`,
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-P7D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${summary} — 7 days remaining`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n"));
  }

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flux//Document Vault//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Flux — ${escapeIcal(vehicleLabel)} Documents`,
    "X-WR-TIMEZONE:Europe/Bucharest",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="flux-documents-${vehicleId.slice(0, 8)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
