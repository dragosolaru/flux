"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle, CheckCircle2, ExternalLink, Flame, Fuel,
  HelpCircle, Home, Loader2, Pencil, Trash2, XCircle, Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

const NON_ELECTRICITY_LABEL: Record<NonElectricityType, string> = {
  gas_bill: "Factură de gaz",
  petrol_receipt: "Bon benzinărie",
  other: "Document necunoscut",
};

const NON_ELECTRICITY_HINT: Record<NonElectricityType, string> = {
  gas_bill: "Nu conține date despre curent electric. Conține și o sesiune de încărcare EV?",
  petrol_receipt: "Bon de carburant. Conține și o sesiune de încărcare EV?",
  other: "Nu am putut identifica tipul. Conține date despre curent electric?",
};

function NonElectricityIcon({ type }: { type: NonElectricityType }) {
  if (type === "gas_bill") return <Flame className="size-4 text-orange-500" />;
  if (type === "petrol_receipt") return <Fuel className="size-4 text-orange-500" />;
  return <HelpCircle className="size-4 text-muted-foreground" />;
}

function friendlyError(raw: string | null): string {
  if (!raw) return "Eroare necunoscută.";
  if (raw.includes("credit balance") || raw.includes("too low"))
    return "Credite Anthropic insuficiente. Adaugă credite la console.anthropic.com/settings/billing, apoi re-uploadează documentul.";
  if (raw.includes("invalid_api_key") || raw.includes("401"))
    return "Cheia API Anthropic este invalidă. Verifică variabila ANTHROPIC_API_KEY în Vercel.";
  if (raw.includes("rate_limit") || raw.includes("429"))
    return "Prea multe cereri. Încearcă din nou în câteva secunde.";
  if (raw.includes("overloaded") || raw.includes("529"))
    return "Serviciul AI este temporar suprasolicitat. Încearcă din nou.";
  return raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
}

function StatusIcon({ status }: { status: Document["status"] }) {
  if (status === "done") return <CheckCircle2 className="size-4 text-chart-2" />;
  if (status === "needs_review") return <AlertTriangle className="size-4 text-yellow-500" />;
  if (status === "error") return <XCircle className="size-4 text-destructive" />;
  return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
}

function statusLabel(status: Document["status"]) {
  if (status === "done") return "Procesat";
  if (status === "needs_review") return "Verificare necesară";
  if (status === "error") return "Eroare";
  if (status === "processing") return "Se procesează…";
  return "În așteptare…";
}

export function DocumentStatusCard({ doc, onEdit, onDelete }: DocumentStatusCardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [costRon, setCostRon] = useState(String(doc.parsed_json?.cost_total ?? ""));
  const [kwh, setKwh] = useState(String(doc.parsed_json?.total_kwh ?? ""));

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
    <Card className={cn(
      "transition-colors",
      doc.status === "needs_review" && !nonElec && "border-yellow-500/40",
      doc.status === "error" && "border-destructive/40",
      nonElec && "border-orange-400/40",
    )}>
      <CardContent className="py-3 px-4">
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
              <span className="text-xs text-muted-foreground">{statusLabel(doc.status)}</span>
              {doc.source === "email" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">email</span>
              )}
              {doc.source === "whatsapp" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">WhatsApp</span>
              )}
            </div>

            {parsed && (
              <div className="mt-1">
                <p className="text-sm font-medium leading-tight">
                  {nonElec
                    ? NON_ELECTRICITY_LABEL[nonElec]
                    : (parsed.provider_name ?? parsed.charger_network ?? doc.original_filename ?? "Document")}
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
                {doc.original_filename ?? "Document"}
              </p>
            )}

            {doc.status === "error" && (
              <p className="mt-1 text-xs text-destructive leading-snug">
                {friendlyError(doc.error_message)}
              </p>
            )}

            {/* Non-electricity banner */}
            {nonElec && !editing && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  {NON_ELECTRICITY_HINT[nonElec]}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setEditing(true)}
                  >
                    Da, adaug manual
                  </Button>
                  {!confirmDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Șterge
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Needs review hint (electricity docs only) */}
            {doc.status === "needs_review" && !editing && !nonElec && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                Unele câmpuri au încredere scăzută. Verifică și corectează dacă e necesar.
              </p>
            )}

            {/* Edit / manual add form */}
            {editing && (
              <form onSubmit={handleEdit} className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`cost-${doc.id}`} className="text-xs">Cost curent (RON)</Label>
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
                    <Label htmlFor={`kwh-${doc.id}`} className="text-xs">kWh electricitate</Label>
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
                  <Button type="submit" size="sm" className="h-6 text-xs">Salvează</Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => setEditing(false)}
                  >
                    Anulează
                  </Button>
                </div>
              </form>
            )}

            {/* Delete confirmation (inline) */}
            {confirmDelete && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-destructive">Ești sigur?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 text-xs"
                  onClick={handleDelete}
                >
                  Șterge
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  Anulează
                </Button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-1">
            {doc.view_url && (
              <a
                href={doc.view_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Deschide documentul"
                title="Deschide documentul"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
            {canEdit && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Editează"
                title="Editează"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {!confirmDelete && onDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                aria-label="Șterge"
                title="Șterge documentul"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
