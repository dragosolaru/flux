"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle, CheckCircle2, ExternalLink, Flame, Fuel,
  HelpCircle, Home, Loader2, Pencil, Trash2, XCircle, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/costs";

interface DocumentStatusCardProps {
  doc: Document;
  onEdit?: (documentId: string, updates: Record<string, unknown>) => void;
  onDelete?: (documentId: string) => void;
}

const NON_ELECTRICITY_TYPES = ["gas_bill", "petrol_receipt", "other"] as const;
type NonElectricityType = (typeof NON_ELECTRICITY_TYPES)[number];

function isNonElectricity(t: string | null | undefined): t is NonElectricityType {
  return NON_ELECTRICITY_TYPES.includes(t as NonElectricityType);
}

// Map enum values to i18n key suffixes (keys live under costs.docStatus.*).
const TYPE_KEY: Record<NonElectricityType, string> = {
  gas_bill: "gasBill",
  petrol_receipt: "petrolReceipt",
  other: "other",
};

function NonElectricityIcon({ type }: { type: NonElectricityType }) {
  if (type === "gas_bill") return <Flame className="size-4 text-orange-500" />;
  if (type === "petrol_receipt") return <Fuel className="size-4 text-orange-500" />;
  return <HelpCircle className="size-4 text-muted-foreground" />;
}

// Returns the friendlyError i18n key suffix, or null to show the raw message.
function friendlyErrorKey(raw: string | null): string | null {
  if (!raw) return "unknown";
  if (raw.includes("credit balance") || raw.includes("too low")) return "insufficientCredits";
  if (raw.includes("invalid_api_key") || raw.includes("401")) return "invalidKey";
  if (raw.includes("rate_limit") || raw.includes("429")) return "rateLimit";
  if (raw.includes("overloaded") || raw.includes("529")) return "overloaded";
  return null;
}

function StatusIcon({ status }: { status: Document["status"] }) {
  if (status === "done") return <CheckCircle2 className="size-4 text-chart-2" />;
  if (status === "needs_review") return <AlertTriangle className="size-4 text-yellow-500" />;
  if (status === "error") return <XCircle className="size-4 text-destructive" />;
  return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
}

const STATUS_KEY: Record<Document["status"], string> = {
  done: "done",
  needs_review: "needsReview",
  error: "error",
  processing: "processing",
  pending: "pending",
};

export function DocumentStatusCard({ doc, onEdit, onDelete }: DocumentStatusCardProps) {
  const t = useTranslations("costs.docStatus");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [costRon, setCostRon] = useState(String(doc.parsed_json?.cost_total ?? ""));
  const [kwh, setKwh] = useState(String(doc.parsed_json?.total_kwh ?? ""));

  const errorKey = friendlyErrorKey(doc.error_message);
  const errorText = errorKey
    ? t(`friendlyError.${errorKey}`)
    : doc.error_message && doc.error_message.length > 120
      ? doc.error_message.slice(0, 120) + "…"
      : doc.error_message ?? t("friendlyError.unknown");

  const parsed = doc.parsed_json;
  const docType = parsed?.document_type ?? null;
  const isHome = docType === "home_bill";
  const isPublic = docType === "public_receipt";
  const nonElec = isNonElectricity(docType) ? docType : null;

  function handleEdit(e: FormEvent) {
    e.preventDefault();
    onEdit?.(doc.id, {
      cost_ron: parseFloat(costRon) || undefined,
      total_kwh: parseFloat(kwh) || undefined,
    });
    setEditing(false);
  }

  function handleDelete() {
    onDelete?.(doc.id);
    setConfirmDelete(false);
  }

  const canEdit = (doc.status === "done" || doc.status === "needs_review") && !nonElec;

  return (
    <div className={cn(
      "rounded-[14px] bg-white/[0.04] px-4 py-3 transition-colors",
      doc.status === "needs_review" && !nonElec && "border border-yellow-500/40",
      doc.status === "error" && "border border-destructive/40",
      nonElec && "border border-orange-400/40",
      !(doc.status === "needs_review" && !nonElec) && doc.status !== "error" && !nonElec && "border border-white/[0.05]",
    )}>
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div className="mt-0.5 shrink-0">
            {nonElec ? (
              <NonElectricityIcon type={nonElec} />
            ) : isHome ? (
              <Home className="size-4 text-muted-foreground" />
            ) : isPublic ? (
              <Zap className="size-4 text-muted-foreground" />
            ) : (
              <div className="size-4" />
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StatusIcon status={doc.status} />
              <span className="text-xs text-muted-foreground">{t(`status.${STATUS_KEY[doc.status]}`)}</span>
              {doc.source === "email" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">email</span>
              )}
              {doc.source === "whatsapp" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">WhatsApp</span>
              )}
            </div>

            {parsed && (
              <div className="mt-1">
                <p className="text-sm font-medium leading-tight">
                  {nonElec
                    ? t(`type.${TYPE_KEY[nonElec]}`)
                    : (parsed.provider_name ?? parsed.charger_network ?? doc.original_filename ?? t("fallbackName"))}
                </p>
                {!nonElec && (
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {parsed.period_start && parsed.period_end && (
                      <span>{parsed.period_start.slice(0, 7)} – {parsed.period_end.slice(0, 7)}</span>
                    )}
                    {parsed.session_timestamp && (
                      <span>{new Date(parsed.session_timestamp).toLocaleDateString("ro-RO")}</span>
                    )}
                    {parsed.total_kwh != null && (
                      <span>{parsed.total_kwh.toFixed(1)} kWh</span>
                    )}
                    {parsed.cost_total != null && (
                      <span className="font-medium text-foreground">
                        {parsed.cost_total.toFixed(2)} {parsed.currency}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {!parsed && doc.status !== "error" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {doc.original_filename ?? t("fallbackName")}
              </p>
            )}

            {doc.status === "error" && (
              <p className="mt-1 text-xs text-destructive leading-snug">
                {errorText}
              </p>
            )}

            {/* Non-electricity banner */}
            {nonElec && !editing && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  {t(`hint.${TYPE_KEY[nonElec]}`)}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setEditing(true)}
                  >
                    {t("addManually")}
                  </Button>
                  {!confirmDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      {tc("delete")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Needs review hint (electricity docs only) */}
            {doc.status === "needs_review" && !editing && !nonElec && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                {t("lowConfidence")}
              </p>
            )}

            {/* Edit / manual add form */}
            {editing && (
              <form onSubmit={handleEdit} className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`cost-${doc.id}`} className="text-xs">{t("fieldCost")}</Label>
                    <Input
                      id={`cost-${doc.id}`}
                      type="number"
                      step="0.01"
                      value={costRon}
                      onChange={(e) => setCostRon(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`kwh-${doc.id}`} className="text-xs">{t("fieldKwh")}</Label>
                    <Input
                      id={`kwh-${doc.id}`}
                      type="number"
                      step="0.1"
                      value={kwh}
                      onChange={(e) => setKwh(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button type="submit" size="sm" className="h-6 text-xs">{tc("save")}</Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => setEditing(false)}
                  >
                    {tc("cancel")}
                  </Button>
                </div>
              </form>
            )}

            {/* Delete confirmation (inline) */}
            {confirmDelete && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-destructive">{t("confirmDelete")}</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 text-xs"
                  onClick={handleDelete}
                >
                  {tc("delete")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  {tc("cancel")}
                </Button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-0.5">
            {doc.view_url && (
              <a
                href={doc.view_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-[10px] text-muted-foreground hover:text-foreground"
                aria-label={t("ariaOpen")}
                title={t("ariaOpen")}
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] text-muted-foreground hover:text-foreground"
                aria-label={t("ariaEdit")}
                title={t("ariaEdit")}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {!confirmDelete && onDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] text-muted-foreground hover:text-destructive"
                aria-label={t("ariaDelete")}
                title={t("ariaDelete")}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
    </div>
  );
}
