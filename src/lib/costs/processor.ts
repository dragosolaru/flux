import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { parseDocument, parseCarDocument } from "@/lib/ai/document-parser";
import { getExchangeRate } from "@/lib/external/bnr/client";
import { attributeHomeBill } from "./attribution";
import { matchChargingSession } from "./session-matcher";
import type { Document, DocumentType, ParsedDocument } from "@/types/costs";
import { HOME_BILL_DEFAULT_PERIOD_DAYS } from "./constants";

const CONFIDENCE_THRESHOLD = 0.7;

const CAR_DOC_TYPES: DocumentType[] = ["rca", "casco", "itp", "rovinieta", "vignette", "bridge_toll", "car_tax", "service", "parking", "fuel", "tires", "fine", "highway_toll", "car_wash", "leasing", "roadside_assistance", "spare_parts", "ferry", "talon"];

// Categories that belong in the per-vehicle document vault (everything except energy bills and non-vehicle docs).
const VEHICLE_CATEGORIES = new Set([
  "insurance", "registration", "inspection", "tax", "toll",
  "operating", "maintenance", "financing", "incident", "driver",
]);

function isVehicleDoc(parsed: ParsedDocument): boolean {
  if (CAR_DOC_TYPES.includes(parsed.document_type as DocumentType)) return true;
  return parsed.category != null && VEHICLE_CATEGORIES.has(parsed.category);
}

function averageConfidence(c: ParsedDocument["confidence"]): number {
  const vals = Object.values(c).filter((v) => typeof v === "number");
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export async function processDocument(documentId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  await supabase
    .from("documents")
    .update({ status: "processing" })
    .eq("id", documentId);

  try {
    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (fetchErr || !doc) throw new Error("Document not found");

    // First pass: use energy prompt to classify the document
    const parsed = await parseDocument(doc as Document);

    // Re-parse with the richer car/expert prompt when pass 1 looks like a vehicle or
    // driver document (known car type, a vehicle/driver category, or genuinely unknown).
    const shouldCarParse = isVehicleDoc(parsed) || parsed.document_type === "unknown";
    const finalParsed = shouldCarParse ? await parseCarDocument(doc as Document) : parsed;
    const avgConf = averageConfidence(finalParsed.confidence);

    // Decide vault membership from the final (richer) result.
    const isCarDoc = isVehicleDoc(finalParsed);

    if (isCarDoc) {
      if (doc.vehicle_id) {
        const refDate = finalParsed.valid_until
          ? new Date(finalParsed.valid_until)
          : finalParsed.valid_from
            ? new Date(finalParsed.valid_from)
            : new Date();
        const exchangeRate = await getExchangeRate(finalParsed.currency ?? "RON", refDate);
        const costTotal = finalParsed.cost_total ?? 0;
        const amountRon = costTotal > 0 ? costTotal * exchangeRate : null;

        await supabase.from("vehicle_doc_meta").insert({
          document_id: documentId,
          vehicle_id: doc.vehicle_id,
          plate_number: finalParsed.plate_number ?? null,
          valid_from: finalParsed.valid_from ?? null,
          valid_until: finalParsed.valid_until ?? null,
          issuer: finalParsed.issuer ?? null,
          amount_ron: amountRon,
        });
      }

      await supabase.from("documents").update({
        document_type: finalParsed.document_type,
        status: avgConf >= CONFIDENCE_THRESHOLD ? "done" : "needs_review",
        parsed_json: finalParsed,
        confidence: avgConf,
        processed_at: new Date().toISOString(),
      }).eq("id", documentId);
      return;
    }

    // Gas bills, petrol receipts, and other non-electricity docs don't generate energy_cost records
    if (finalParsed.document_type === "gas_bill" || finalParsed.document_type === "petrol_receipt" || finalParsed.document_type === "other") {
      await supabase.from("documents").update({
        document_type: finalParsed.document_type,
        status: "needs_review",
        parsed_json: finalParsed,
        confidence: avgConf,
        processed_at: new Date().toISOString(),
      }).eq("id", documentId);
      return;
    }

    // Energy receipt (home_bill / public_receipt) uploaded to the per-vehicle vault:
    // don't silently add it to costs. Park it and let the vault ask the user (see
    // the "add to costs" action on /documents → POST .../vault/[id]/add-to-costs).
    if (doc.source === "vault-upload") {
      await supabase.from("documents").update({
        document_type: finalParsed.document_type,
        status: "needs_review",
        parsed_json: finalParsed,
        confidence: avgConf,
        processed_at: new Date().toISOString(),
      }).eq("id", documentId);
      return;
    }

    if (doc.vehicle_id) {
      await createEnergyCostRecord(documentId, doc.vehicle_id as string, finalParsed);
    }

    const criticalConfidence = Math.min(
      finalParsed.confidence.cost_total ?? 0,
      finalParsed.confidence.document_type ?? 0,
    );
    const finalStatus = criticalConfidence < CONFIDENCE_THRESHOLD ? "needs_review" : "done";

    await supabase
      .from("documents")
      .update({
        document_type: finalParsed.document_type,
        status: finalStatus,
        parsed_json: finalParsed,
        confidence: avgConf,
        processed_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  } catch (err) {
    await supabase
      .from("documents")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : String(err),
        processed_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  }
}

// Builds the energy_cost record (currency conversion, home-bill attribution, public
// session matching) from an already-parsed document. Used by processDocument for
// normal uploads, and by the vault "add to costs" action for energy receipts the
// user explicitly chose to promote from the document vault.
export async function createEnergyCostRecord(
  documentId: string,
  vehicleId: string,
  parsed: ParsedDocument,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const docDate =
    parsed.period_end
      ? new Date(parsed.period_end)
      : parsed.session_timestamp
        ? new Date(parsed.session_timestamp)
        : new Date();

  const exchangeRate = await getExchangeRate(parsed.currency ?? "RON", docDate);
  const costTotal = parsed.electricity_cost ?? parsed.cost_total ?? 0;
  const costRon = costTotal * exchangeRate;

  let chargingSessionId: string | null = null;
  let vehicleKwhAttributed: number | null = null;
  let vehicleCostRon = costRon;
  let periodStart: Date;
  let periodEnd: Date;

  if (parsed.document_type === "home_bill") {
    periodStart = parsed.period_start ? new Date(parsed.period_start) : new Date(Date.now() - HOME_BILL_DEFAULT_PERIOD_DAYS * 86_400_000);
    periodEnd = parsed.period_end ? new Date(parsed.period_end) : new Date();

    const attribution = await attributeHomeBill(
      vehicleId,
      periodStart,
      periodEnd,
      parsed.total_kwh ?? 0,
      costRon,
    );
    if (attribution.sessionCount > 0) {
      vehicleKwhAttributed = attribution.vehicleKwh;
      vehicleCostRon = attribution.vehicleCostRon;
    } else {
      // No charging sessions found for this period — can't attribute proportionally.
      vehicleKwhAttributed = parsed.total_kwh;
      vehicleCostRon = costRon;
    }
  } else {
    // public_receipt — period = same day as session
    const ts = parsed.session_timestamp ? new Date(parsed.session_timestamp) : docDate;
    periodStart = new Date(ts.toISOString().slice(0, 10));
    periodEnd = new Date(ts.toISOString().slice(0, 10));
    vehicleKwhAttributed = parsed.total_kwh;

    if (parsed.session_timestamp) {
      const match = await matchChargingSession(vehicleId, new Date(parsed.session_timestamp));
      if (match) {
        chargingSessionId = match.sessionId;
        await supabase
          .from("charging_sessions")
          .update({ cost_ron: costRon, cost_source: "document" })
          .eq("id", match.sessionId);
      }
    }
  }

  if (parsed.document_type === "unknown") return;

  await supabase.from("energy_costs").insert({
    document_id: documentId,
    vehicle_id: vehicleId,
    document_type: parsed.document_type,
    period_start: periodStart.toISOString().slice(0, 10),
    period_end: periodEnd.toISOString().slice(0, 10),
    total_kwh: parsed.total_kwh,
    vehicle_kwh_attributed: vehicleKwhAttributed,
    original_amount: costTotal,
    original_currency: parsed.currency ?? "RON",
    exchange_rate: exchangeRate,
    cost_ron: vehicleCostRon,
    provider_name: parsed.provider_name,
    charger_network: parsed.charger_network,
    location_name: parsed.location_name,
    charging_session_id: chargingSessionId,
  });
}
