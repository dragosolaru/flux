"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useVaultDocuments } from "@/hooks/useVaultDocuments";
import { useVehicleContext } from "@/contexts/vehicle";
import * as documentsApi from "@/lib/api/documents";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { cn } from "@/lib/utils";
import type { VaultDocument } from "@/types/costs";

interface DocumentsClientProps {
  headingText: string;
}

const BADGE_COLORS: Record<string, string> = {
  rca:        "bg-blue-500/20 text-blue-400 border-blue-500/30",
  itp:        "bg-green-500/20 text-green-400 border-green-500/30",
  rovinieta:  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  vignette:   "bg-purple-500/20 text-purple-400 border-purple-500/30",
  bridge_toll:"bg-orange-500/20 text-orange-400 border-orange-500/30",
  car_tax:    "bg-red-500/20 text-red-400 border-red-500/30",
};

function expiryColors(days: number | null): { text: string; icon: string; border: string } {
  if (days === null) return { text: "text-muted-foreground", icon: "", border: "border-border" };
  if (days <= 0)  return { text: "text-destructive font-semibold", icon: "text-destructive", border: "border-destructive/40" };
  if (days <= 7)  return { text: "text-red-400 font-semibold",    icon: "text-red-400",      border: "border-red-400/30" };
  if (days <= 30) return { text: "text-amber-400 font-semibold",  icon: "text-amber-400",    border: "border-amber-400/30" };
  return { text: "text-green-400", icon: "", border: "border-border" };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function ScanningCard({ filename }: { filename: string | null }) {
  const t = useTranslations("documents");
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/60 p-4">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
          <Loader2 className="size-4 animate-spin text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("scanning")}</p>
          {filename && <p className="truncate text-xs text-muted-foreground/60">{filename}</p>}
        </div>
      </div>
    </div>
  );
}

function DocCard({ doc, onDelete }: { doc: VaultDocument; onDelete: (id: string) => void }) {
  const t = useTranslations("documents");
  const [deleting, setDeleting] = useState(false);

  const typeLabel = (() => {
    const key = `type_${doc.document_type}` as Parameters<typeof t>[0];
    try { return t(key); } catch { return t("type_other"); }
  })();

  const colors = expiryColors(doc.days_until_expiry);
  const showWarning = doc.days_until_expiry !== null && doc.days_until_expiry <= 30;
  const badgeClass = BADGE_COLORS[doc.document_type] ?? "bg-muted/40 text-muted-foreground border-border";

  const expiryLabel = (() => {
    if (!doc.valid_until || doc.days_until_expiry === null) return null;
    if (doc.days_until_expiry <= 0) return t("expired_label");
    if (doc.days_until_expiry <= 7) return t("days_left", { days: doc.days_until_expiry });
    if (doc.days_until_expiry <= 30) return t("expiring_soon");
    return t("days_left", { days: doc.days_until_expiry });
  })();

  async function handleDelete() {
    setDeleting(true);
    try {
      await documentsApi.remove(doc.id);
      onDelete(doc.id);
    } catch {
      toast.error(t("delete_error"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={cn("rounded-xl border bg-card/60 p-4 backdrop-blur-sm transition-colors", colors.border)}>
      {/* Header row: badge + warning + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", badgeClass)}>
            {typeLabel}
          </span>
          {showWarning && (
            <span className={cn("flex items-center gap-1 text-xs font-medium", colors.text)}>
              <AlertTriangle className={cn("size-3.5", colors.icon)} />
              {expiryLabel}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {doc.view_url && (
            <Button variant="ghost" size="icon" className="size-7" asChild>
              <a href={doc.view_url} target="_blank" rel="noopener noreferrer" aria-label={t("view_btn")}>
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
          <Button
            variant="ghost" size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={handleDelete} disabled={deleting}
            aria-label={t("delete_btn")}
          >
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* Fields grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {doc.plate_number && (
          <div>
            <span className="text-muted-foreground">{t("plate")}</span>
            <p className="font-mono font-semibold text-foreground tracking-wider">{doc.plate_number}</p>
          </div>
        )}
        {doc.issuer && (
          <div>
            <span className="text-muted-foreground">{t("issuer")}</span>
            <p className="font-medium text-foreground">{doc.issuer}</p>
          </div>
        )}
        {(doc.valid_from || doc.valid_until) && (
          <div className="col-span-2">
            <span className="text-muted-foreground flex items-center gap-1">
              <CalendarDays className="size-3" />{t("valid_period")}
            </span>
            <p className={cn("font-medium", !showWarning ? "text-foreground" : colors.text)}>
              {doc.valid_from ? fmtDate(doc.valid_from) : "—"}
              {" → "}
              {doc.valid_until ? fmtDate(doc.valid_until) : "—"}
              {!showWarning && doc.valid_until && doc.days_until_expiry !== null && (
                <span className="ml-1 text-muted-foreground">
                  ({t("days_left", { days: doc.days_until_expiry })})
                </span>
              )}
            </p>
          </div>
        )}
        {doc.amount_ron !== null && doc.amount_ron !== undefined && (
          <div>
            <span className="text-muted-foreground">{t("amount")}</span>
            <p className="font-medium text-foreground">{doc.amount_ron.toFixed(2)} RON</p>
          </div>
        )}
      </div>

      {doc.original_filename && (
        <p className="mt-2 truncate text-[10px] text-muted-foreground/40">{doc.original_filename}</p>
      )}
    </div>
  );
}

export function DocumentsClient({ headingText }: DocumentsClientProps) {
  const t = useTranslations("documents");
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { selectedVehicleId: vehicleId } = useVehicleContext();
  const { data: docs, isLoading: docsLoading } = useVaultDocuments(vehicleId);

  async function handleUpload(file: File) {
    if (!vehicleId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("vehicleId", vehicleId);
      form.append("vault", "1");
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? "Upload failed");
      }
      void qc.invalidateQueries({ queryKey: ["vault-documents", vehicleId] });
      toast.success(t("upload_success"));
    } catch {
      toast.error(t("upload_error"));
    } finally {
      setUploading(false);
    }
  }

  function handleDelete() {
    void qc.invalidateQueries({ queryKey: ["vault-documents", vehicleId] });
  }

  return (
    <PageWrapper className="mx-auto max-w-2xl gap-4 pb-28">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{headingText}</h1>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !vehicleId}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          <span className="hidden sm:inline">{t("upload_btn")}</span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = "";
          }}
        />
      </div>

      {docsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !docs || docs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText className="size-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{t("empty_title")}</p>
          <p className="max-w-xs text-xs text-muted-foreground/60">{t("empty_hint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) =>
            doc.status === "pending" || doc.status === "processing" ? (
              <ScanningCard key={doc.id} filename={doc.original_filename} />
            ) : (
              <DocCard key={doc.id} doc={doc} onDelete={handleDelete} />
            ),
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        {t("email_hint")}
      </div>
    </PageWrapper>
  );
}
