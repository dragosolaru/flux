"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  InputRow,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
  Spacer,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import { useDeleteDocument, useDocuments, useEditDocument } from "@/hooks/useDocuments";
import { useVehicleContext } from "@/contexts/vehicle";
import type { Document } from "@/types/costs";

/** "" → null, so clearing a field means "unknown" rather than zero. */
function num(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Correcting what the parser read.
 *
 * The last handoff to v1, and the one that needed the most care: this is a form
 * with money in it, and the amount here becomes a row in the cost history. It
 * edits **in place** — the value you are correcting is the value you are
 * looking at — and commits **once**, because a document is corrected as a whole
 * and five per-field saves are five chances to leave it half-fixed.
 *
 * Only the fields the PATCH route accepts are shown. A field the API will not
 * store is a field that silently discards a correction.
 */
export function ReviewV2Client({ documentId }: { documentId: string }) {
  const t = useTranslations("documents");
  const tc = useTranslations("costs");
  const tv = useTranslations("v2");
  const router = useRouter();

  const { selectedVehicleId } = useVehicleContext();
  const vehicleId = selectedVehicleId ?? "";
  // Read from the list rather than adding a by-id endpoint: the list is already
  // loaded and cached by the screen you arrived from, so this opens instantly
  // and one fewer route exists to authorise.
  const { data: documents = [], isLoading } = useDocuments(vehicleId);
  const document = documents.find((d) => d.id === documentId);

  const edit = useEditDocument(vehicleId);
  const remove = useDeleteDocument(vehicleId);

  const parsed = document?.parsed_json ?? null;
  const [amount, setAmount] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [totalKwh, setTotalKwh] = useState<string | null>(null);
  const [carKwh, setCarKwh] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  // Seeded from the document on first read, then the driver's value wins. A
  // fallback chain rather than an effect that copies into state: an effect
  // would overwrite what someone is typing the moment the list refetches, and
  // this screen polls every 15 seconds.
  const v = {
    amount: amount ?? (parsed?.cost_total != null ? String(parsed.cost_total) : ""),
    currency: currency ?? parsed?.currency ?? "RON",
    totalKwh: totalKwh ?? (parsed?.total_kwh != null ? String(parsed.total_kwh) : ""),
    carKwh: carKwh ?? "",
    provider: provider ?? parsed?.provider_name ?? "",
    from: from ?? parsed?.period_start ?? "",
    to: to ?? parsed?.period_end ?? "",
  };

  function save() {
    // Only what changed and only what the route accepts. Sending a null for an
    // untouched field would erase a value the parser got right.
    const updates: Record<string, unknown> = {};
    const amountValue = num(v.amount);
    if (amountValue != null) updates.original_amount = amountValue;
    if (v.currency.trim().length === 3) updates.original_currency = v.currency.trim().toUpperCase();
    const total = num(v.totalKwh);
    if (total != null) updates.total_kwh = total;
    const car = num(v.carKwh);
    if (car != null) updates.vehicle_kwh_attributed = car;
    if (v.provider.trim()) updates.provider_name = v.provider.trim();
    if (v.from) updates.period_start = v.from;
    if (v.to) updates.period_end = v.to;

    if (Object.keys(updates).length === 0) {
      toast.error(tv("nothing_to_save"));
      return;
    }

    edit.mutate(
      { documentId, updates },
      {
        onSuccess: () => {
          toast.success(tc("edit_success"));
          router.push("/v2/documents");
        },
        onError: () => toast.error(t("save_error")),
      },
    );
  }

  if (!document) {
    return (
      <Screen>
        <ScreenHeader title={t("heading")} switcher={<VehicleSwitch />} />
        <p className="mt-6 text-sm text-muted-foreground">
          {isLoading ? tv("loading") : tv("document_not_found")}
        </p>
        <Spacer />
        <NavBar />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={title(document, t)}
        switcher={<VehicleSwitch />}
        meta={document.confidence != null ? `${Math.round(document.confidence * 100)}%` : undefined}
        metaTone={
          document.confidence != null && document.confidence < 0.7 ? "amber" : "muted"
        }
      />

      {document.status === "needs_review" && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {t("needs_review")}
        </p>
      )}

      <div className="mt-6">
        <SectionLabel>{tc("kpi_total_lei")}</SectionLabel>
        <div className="mt-2">
          <InputRow
            label={tc("manual_amount_label")}
            value={v.amount}
            onChange={setAmount}
            type="number"
            placeholder="0.00"
          />
          <InputRow
            label={tc("manual_type_label")}
            value={v.currency}
            onChange={setCurrency}
            placeholder="RON"
            last
          />
        </div>
      </div>

      <div className="mt-7">
        <SectionLabel>{tc("kpi_total_kwh")}</SectionLabel>
        <div className="mt-2">
          <InputRow
            label={tc("kpi_total_energy")}
            value={v.totalKwh}
            onChange={setTotalKwh}
            type="number"
            unit="kWh"
          />
          {/* Only meaningful on a household bill, where the car is part of a
              larger total. Left blank on a public receipt, where every kWh on
              the paper went into this car. */}
          <InputRow
            label={tv("attributed_to_car")}
            value={v.carKwh}
            onChange={setCarKwh}
            type="number"
            unit="kWh"
            last
          />
        </div>
      </div>

      <div className="mt-7">
        <SectionLabel>{tc("manual_issuer_label")}</SectionLabel>
        <div className="mt-2">
          <InputRow
            label={tc("manual_issuer_label")}
            value={v.provider}
            onChange={setProvider}
            placeholder={tc("manual_issuer_placeholder")}
          />
          <InputRow label={tv("period_from")} value={v.from} onChange={setFrom} type="date" />
          <InputRow label={tv("period_to")} value={v.to} onChange={setTo} type="date" last />
        </div>
      </div>

      <div className="mt-7 pb-8">
        <Rows>
          <Row
            label={<span className="text-primary">{tv("save_document")}</span>}
            pending={edit.isPending}
            pendingLabel={tv("sending")}
            onClick={save}
          />
          <Row
            icon={<Trash2 strokeWidth={1.5} className="text-destructive" />}
            label={<span className="text-destructive">{t("delete_btn")}</span>}
            pending={remove.isPending}
            pendingLabel={tv("sending")}
            onClick={() =>
              remove.mutate(documentId, {
                onSuccess: () => {
                  toast.success(tc("delete_success"));
                  router.push("/v2/documents");
                },
                onError: () => toast.error(t("delete_error")),
              })
            }
            last
          />
        </Rows>
        {document.original_filename && (
          <p className="mt-4 truncate">
            <Mono className="text-muted-foreground">{document.original_filename}</Mono>
          </p>
        )}
      </div>

      <NavBar />
    </Screen>
  );
}

function title(document: Document, t: (key: string) => string): string {
  return document.parsed_json?.issuer ?? document.original_filename ?? t("type_other");
}
