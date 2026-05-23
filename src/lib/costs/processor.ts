import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { parseDocument } from "@/lib/ai/document-parser";
import { getExchangeRate } from "@/lib/external/bnr/client";
import { attributeHomeBill } from "./attribution";
import { matchChargingSession } from "./session-matcher";
import type { Document, ParsedDocument } from "@/types/costs";
import { HOME_BILL_DEFAULT_PERIOD_DAYS } from "./constants";

const CONFIDENCE_THRESHOLD = 0.7;

function averageConfidence(c: ParsedDocument["confidence"]): number {
  const vals = Object.values(c);
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

    const parsed = await parseDocument(doc as Document);
    const avgConf = averageConfidence(parsed.confidence);

    // Currency conversion
    const docDate =
      parsed.period_end
        ? new Date(parsed.period_end)
        : parsed.session_timestamp
          ? new Date(parsed.session_timestamp)
          : new Date();

    const exchangeRate = await getExchangeRate(parsed.currency ?? "RON", docDate);
    const costTotal = parsed.cost_total ?? 0;
    const costRon = costTotal * exchangeRate;

    let chargingSessionId: string | null = null;
    let vehicleKwhAttributed: number | null = null;
    let vehicleCostRon = costRon;
    let periodStart: Date;
    let periodEnd: Date;

    if (parsed.document_type === "home_bill") {
      periodStart = parsed.period_start ? new Date(parsed.period_start) : new Date(Date.now() - HOME_BILL_DEFAULT_PERIOD_DAYS * 86_400_000);
      periodEnd = parsed.period_end ? new Date(parsed.period_end) : new Date();

      if (doc.vehicle_id) {
        const attribution = await attributeHomeBill(
          doc.vehicle_id as string,
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
          // Store the full bill cost and flag for review so the user can adjust.
          vehicleKwhAttributed = parsed.total_kwh;
          vehicleCostRon = costRon;
        }
      }
    } else {
      // public_receipt — period = same day as session
      const ts = parsed.session_timestamp ? new Date(parsed.session_timestamp) : docDate;
      periodStart = new Date(ts.toISOString().slice(0, 10));
      periodEnd = new Date(ts.toISOString().slice(0, 10));
      vehicleKwhAttributed = parsed.total_kwh;

      if (doc.vehicle_id && parsed.session_timestamp) {
        const match = await matchChargingSession(
          doc.vehicle_id as string,
          new Date(parsed.session_timestamp),
        );
        if (match) {
          chargingSessionId = match.sessionId;
          await supabase
            .from("charging_sessions")
            .update({ cost_ron: costRon, cost_source: "document" })
            .eq("id", match.sessionId);
        }
      }
    }

    // Insert energy_cost record
    if (doc.vehicle_id && parsed.document_type !== "unknown") {
      await supabase.from("energy_costs").insert({
        document_id: documentId,
        vehicle_id: doc.vehicle_id,
        document_type: parsed.document_type,
        period_start: periodStart!.toISOString().slice(0, 10),
        period_end: periodEnd!.toISOString().slice(0, 10),
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

    const criticalConfidence = Math.min(
      parsed.confidence.cost_total,
      parsed.confidence.document_type,
    );
    const finalStatus = criticalConfidence < CONFIDENCE_THRESHOLD ? "needs_review" : "done";

    await supabase
      .from("documents")
      .update({
        status: finalStatus,
        parsed_json: parsed,
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
