"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
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
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { cn } from "@/lib/utils";
import type { VaultDocument } from "@/types/costs";

interface DocumentsClientProps {
  headingText: string;
}

type DocTypeBadgeColor =
  | "bg-blue-500/20 text-blue-400 border-blue-500/30"
  | "bg-green-500/20 text-green-400 border-green-500/30"
  | "bg-amber-500/20 text-amber-400 border-amber-500/30"
  | "bg-purple-500/20 text-purple-400 border-purple-500/30"
  | "bg-orange-500/20 text-orange-400 border-orange-500/30"
  | "bg-red-500/20 text-red-400 border-red-500/30"
  | "bg-muted/40 text-muted-foreground border-border";

function docTypeBadgeColor(type: VaultDocument["document_type"]): DocTypeBadgeColor {
  switch (type) {
    case "rca": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "itp": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "rovinieta": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "vignette": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "bridge_toll": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "car_tax": return "bg-red-500/20 text-red-400 border-red-500/30";
    default: return "bg-muted/40 text-muted-foreground border-border";
  }
}

function expiryClass(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days <= 0) return "text-destructive font-semibold";
  if (days <= 30) return "text-amber-400 font-semibold";
  return "text-green-400";
}

function DocCard({
  doc,
  onDelete,
}: {
  doc: VaultDocument;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("documents");
  const [deleting, setDeleting] = useState(false);

  const typeLabel = (() => {
    switch (doc.document_type) {
      case "rca": return t("type_rca");
      case "itp": return t("type_itp");
      case "rovinieta": return t("type_rovinieta");
      case "vignette": return t("type_vignette");
      case "bridge_toll": return t("type_bridge_toll");
      case "car_tax": return t("type_car_tax");
      default: return t("type_other");
    }
  })();

  const expiryText = (() => {
    if (!doc.valid_until) return null;
    if (doc.days_until_expiry === null) return null;
    if (doc.days_until_expiry <= 0) return t("expired_label");
    if (doc.days_until_expiry <= 30) return t("expiring_soon");
    return t("days_left", { days: doc.days_until_expiry });
  })();

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      onDelete(doc.id);
    } catch {
      toast.error(t("delete_error"));
    } finally {
      setDeleting(false);
    }
  }

  const isProcessing = doc.status === "pending" || doc.status === "processing";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
      <div className="mt-0.5 shrink-0">
        {isProcessing ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="size-4 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              docTypeBadgeColor(doc.document_type),
            )}
          >
            {typeLabel}
          </span>
          {isProcessing && (
            <span className="text-xs text-muted-foreground">{t("processing")}</span>
          )}
        </div>

        {doc.plate_number && (
          <p className="text-xs text-muted-foreground">
            {t("plate")}: <span className="font-mono font-medium text-foreground">{doc.plate_number}</span>
          </p>
        )}

        {doc.issuer && (
          <p className="text-xs text-muted-foreground">
            {t("issuer")}: <span className="text-foreground">{doc.issuer}</span>
          </p>
        )}

        {doc.valid_until && (
          <p className={cn("text-xs", expiryClass(doc.days_until_expiry))}>
            {t("expiry_label")}: {doc.valid_until}
            {expiryText && <span className="ml-1">· {expiryText}</span>}
          </p>
        )}

        {doc.original_filename && (
          <p className="truncate text-xs text-muted-foreground/60">{doc.original_filename}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {doc.view_url && (
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a href={doc.view_url} target="_blank" rel="noopener noreferrer" aria-label={t("view_btn")}>
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          disabled={deleting}
          aria-label={t("delete_btn")}
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
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
          {docs.map((doc) => (
            <DocCard key={doc.id} doc={doc} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        {t("email_hint")}
      </div>
    </PageWrapper>
  );
}
