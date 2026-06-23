import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function escapeIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcalDate(iso: string): string {
  return iso.replace(/-/g, "");
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

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, name, plate_number")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!vehicle) return NextResponse.json({ message: "Vehicle not found" }, { status: 404 });

  const vehicleLabel = (vehicle as { name?: string | null; plate_number?: string | null }).name
    ?? (vehicle as { plate_number?: string | null }).plate_number
    ?? "Vehicle";

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
      `DTSTART;VALUE=DATE:${toIcalDate(validUntil)}`,
      `DTEND;VALUE=DATE:${toIcalDate(validUntil)}`,
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
