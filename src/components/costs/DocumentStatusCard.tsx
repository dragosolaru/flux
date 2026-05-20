"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Pencil, Home, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/costs";

interface DocumentStatusCardProps {
  doc: Document;
  onEdit?: (documentId: string, updates: Record<string, unknown>) => void;
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

export function DocumentStatusCard({ doc, onEdit }: DocumentStatusCardProps) {
  const [editing, setEditing] = useState(false);
  const [costRon, setCostRon] = useState(
    String(doc.parsed_json?.cost_total ?? ""),
  );
  const [kwh, setKwh] = useState(String(doc.parsed_json?.total_kwh ?? ""));

  const parsed = doc.parsed_json;
  const isHome = parsed?.document_type === "home_bill";
  const isPublic = parsed?.document_type === "public_receipt";

  function handleEdit(e: FormEvent) {
    e.preventDefault();
    onEdit?.(doc.id, {
      cost_ron: parseFloat(costRon) || undefined,
      total_kwh: parseFloat(kwh) || undefined,
    });
    setEditing(false);
  }

  return (
    <Card className={cn(
      "transition-colors",
      doc.status === "needs_review" && "border-yellow-500/40",
      doc.status === "error" && "border-destructive/40",
    )}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div className="mt-0.5 shrink-0">
            {isHome ? (
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
            </div>

            {parsed && (
              <div className="mt-1">
                <p className="text-sm font-medium leading-tight">
                  {parsed.provider_name ?? parsed.charger_network ?? doc.original_filename ?? "Document"}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {parsed.period_start && parsed.period_end && (
                    <span>
                      {parsed.period_start.slice(0, 7)} – {parsed.period_end.slice(0, 7)}
                    </span>
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
              </div>
            )}

            {!parsed && doc.status !== "error" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {doc.original_filename ?? "Document"}
              </p>
            )}

            {doc.status === "error" && (
              <p className="mt-1 text-xs text-destructive">{doc.error_message}</p>
            )}

            {doc.status === "needs_review" && !editing && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                Unele câmpuri au încredere scăzută. Verifică și corectează dacă e necesar.
              </p>
            )}

            {editing && (
              <form onSubmit={handleEdit} className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`cost-${doc.id}`} className="text-xs">Cost (RON)</Label>
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
                    <Label htmlFor={`kwh-${doc.id}`} className="text-xs">kWh</Label>
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
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditing(false)}>Anulează</Button>
                </div>
              </form>
            )}
          </div>

          {/* Edit button */}
          {(doc.status === "done" || doc.status === "needs_review") && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Editează"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
