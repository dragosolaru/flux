"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  Receipt,
  Pencil,
  Check,
  X,
  CalendarDays,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useVaultDocuments } from "@/hooks/useVaultDocuments";
import { useVehicleContext } from "@/contexts/vehicle";
import { apiFetch } from "@/lib/api-fetch";
import * as documentsApi from "@/lib/api/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { cn } from "@/lib/utils";
import type { VaultDocument } from "@/types/costs";

interface DocumentsClientProps {
  headingText: string;
}

const INSOLVENT_INSURERS = new Set(["Euroins România", "Euroins", "City Insurance"]);
const MANDATORY_TYPES = new Set(["rca", "itp", "rovinieta"]);

type DocTypeBadgeColor =
  | "bg-blue-500/20 text-blue-400 border-blue-500/30"
  | "bg-green-500/20 text-green-400 border-green-500/30"
  | "bg-amber-500/20 text-amber-400 border-amber-500/30"
  | "bg-purple-500/20 text-purple-400 border-purple-500/30"
  | "bg-orange-500/20 text-orange-400 border-orange-500/30"
  | "bg-red-500/20 text-red-400 border-red-500/30"
  | "bg-teal-500/20 text-teal-400 border-teal-500/30"
  | "bg-muted/40 text-muted-foreground border-border";

function docTypeBadgeColor(type: NonNullable<VaultDocument["document_type"]> | null, isProcessing: boolean): DocTypeBadgeColor {
  if (isProcessing || type === null) return "bg-muted/40 text-muted-foreground border-border";
  switch (type) {
    case "rca": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "casco": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "itp": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "rovinieta": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "vignette": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "bridge_toll": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "car_tax": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "service": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "parking": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "fuel": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "tires": return "bg-muted/40 text-muted-foreground border-border";
    case "fine": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "highway_toll": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "car_wash": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "leasing": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "roadside_assistance": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "spare_parts": return "bg-muted/40 text-muted-foreground border-border";
    case "ferry": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "talon": return "bg-teal-500/20 text-teal-400 border-teal-500/30";
    default: return "bg-muted/40 text-muted-foreground border-border";
  }
}

function formatRon(amount: number): string {
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount) + " RON";
}

function formatDate(isoDate: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

type DocumentType = VaultDocument["document_type"];
type DocumentCategory = NonNullable<VaultDocument["category"]>;

const TYPE_TO_CATEGORY: Record<string, DocumentCategory> = {
  rca: "insurance", casco: "insurance", roadside_assistance: "insurance",
  talon: "registration",
  itp: "inspection",
  car_tax: "tax",
  rovinieta: "toll", vignette: "toll", bridge_toll: "toll", highway_toll: "toll", ferry: "toll",
  fuel: "operating", parking: "operating", car_wash: "operating",
  service: "maintenance", tires: "maintenance", spare_parts: "maintenance",
  leasing: "financing",
  fine: "incident",
};

const FILENAME_KEYWORDS: Array<[RegExp, NonNullable<DocumentType>]> = [
  [/anvelope|cauciuc|tyre|tire/i, "tires"],
  [/\brca\b|rc\s*auto|responsabilitate\s*civila|carte\s*verde|green\s*card/i, "rca"],
  [/casco/i, "casco"],
  [/asigurare|polita|insurance/i, "rca"],
  [/\bitp\b|inspectie\s*tehnica|t[üu]v|\bmot\b|controle\s*technique|revisione|\bitv\b/i, "itp"],
  [/rovinieta|vigneta\s*ro/i, "rovinieta"],
  [/taxa\s*auto|impozit\s*auto/i, "car_tax"],
  [/\bservice\b|reparati/i, "service"],
  [/benzin|combustibil|motorin|carburant|fuel/i, "fuel"],
  [/amenda|contraventie|fine/i, "fine"],
  [/parcare|parking/i, "parking"],
  [/spalatorie|car.?wash/i, "car_wash"],
  [/piese\s*auto|spare.?part/i, "spare_parts"],
  [/leasing/i, "leasing"],
  [/tractare|depanare|roadside/i, "roadside_assistance"],
  [/feribot|ferry/i, "ferry"],
  [/autostrada|vignett|crit.?air/i, "highway_toll"],
  [/pod\b|bridge.?toll/i, "bridge_toll"],
  [/talon|carte\s*identitate\s*vehicul|certificat\s*inmatriculare|coc\b/i, "talon"],
  [/permis|atestat|tahograf|tachograph/i, "fine"],
];

function inferTypeFromFilename(filename: string | null): NonNullable<DocumentType> | null {
  if (!filename) return null;
  for (const [pattern, type] of FILENAME_KEYWORDS) {
    if (pattern.test(filename)) return type;
  }
  return null;
}

// Display order of category groups in the vault.
const CATEGORY_ORDER: DocumentCategory[] = [
  "insurance", "inspection", "registration", "tax", "toll",
  "maintenance", "operating", "financing", "incident", "driver", "other",
];

const CATEGORY_I18N: Record<DocumentCategory, string> = {
  insurance: "group_insurance",
  inspection: "group_inspection",
  registration: "group_registration",
  tax: "group_taxes",
  toll: "group_toll",
  maintenance: "group_service",
  operating: "group_operating",
  financing: "group_financing",
  incident: "group_incident",
  driver: "group_driver",
  energy: "group_other",
  other: "group_other",
};

function getCategory(doc: VaultDocument): DocumentCategory {
  if (doc.category && doc.category !== "energy") return doc.category;
  const t = doc.document_type ?? inferTypeFromFilename(doc.original_filename);
  if (t && TYPE_TO_CATEGORY[t]) return TYPE_TO_CATEGORY[t];
  return "other";
}

function DocCard({
  doc,
  onDelete,
  onUpdated,
  locale,
  vehicleId,
}: {
  doc: VaultDocument;
  onDelete: (id: string) => void;
  onUpdated: () => void;
  locale: string;
  vehicleId: string;
}) {
  const t = useTranslations("documents");
  const [deleting, setDeleting] = useState(false);
  const [editingCost, setEditingCost] = useState(false);
  const [costInput, setCostInput] = useState("");

  const isProcessing = doc.status === "pending" || doc.status === "processing";
  const isError = doc.status === "error";
  const needsReview = doc.status === "needs_review";
  const hasData = !!(doc.issuer ?? doc.valid_until ?? doc.plate_number);

  const aiLabel = doc.label?.trim() || null;
  const inferredType = !doc.document_type && !aiLabel && !isProcessing ? inferTypeFromFilename(doc.original_filename) : null;
  const effectiveType = doc.document_type ?? inferredType;
  const knownType = effectiveType && effectiveType !== "other" && effectiveType !== "unknown" ? effectiveType : null;

  function typeLabelFor(type: NonNullable<DocumentType> | null): string {
    switch (type) {
      case "rca": return t("type_rca");
      case "casco": return t("type_casco");
      case "itp": return t("type_itp");
      case "rovinieta": return t("type_rovinieta");
      case "vignette": return t("type_vignette");
      case "bridge_toll": return t("type_bridge_toll");
      case "car_tax": return t("type_car_tax");
      case "service": return t("type_service");
      case "parking": return t("type_parking");
      case "fuel": return t("type_fuel");
      case "tires": return t("type_tires");
      case "fine": return t("type_fine");
      case "highway_toll": return t("type_highway_toll");
      case "car_wash": return t("type_car_wash");
      case "leasing": return t("type_leasing");
      case "roadside_assistance": return t("type_roadside_assistance");
      case "spare_parts": return t("type_spare_parts");
      case "ferry": return t("type_ferry");
      case "talon": return t("type_talon");
      default: return t("type_other");
    }
  }

  const typeLabel = isProcessing
    ? t("processing_type_placeholder")
    : knownType
      ? typeLabelFor(knownType)
      : (aiLabel ?? typeLabelFor(effectiveType));

  const days = doc.days_until_expiry;
  const expiryText = (() => {
    if (!doc.valid_until || days === null) return null;
    if (days <= 0) return t("expired_label");
    return t("days_left", { days });
  })();

  const expiryColorClass = (() => {
    if (days === null) return "text-muted-foreground";
    if (days <= 0) return "text-destructive font-semibold";
    if (days <= 30) return "text-amber-400 font-semibold";
    return "text-green-400";
  })();

  const saveCostMutation = useMutation({
    mutationFn: (amount: number | null) =>
      documentsApi.updateVaultDoc(vehicleId, doc.id, { amount_ron: amount }),
    onSuccess: () => { setEditingCost(false); onUpdated(); },
    onError: () => toast.error(t("save_error")),
  });

  function startEditCost() {
    setCostInput(doc.amount_ron != null ? String(doc.amount_ron) : "");
    setEditingCost(true);
  }

  function submitCost() {
    const trimmed = costInput.trim();
    const amount = trimmed === "" ? null : parseFloat(trimmed.replace(",", "."));
    if (trimmed !== "" && (isNaN(amount!) || amount! <= 0)) {
      toast.error(t("invalid_cost"));
      return;
    }
    saveCostMutation.mutate(amount);
  }

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

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border bg-card/60 p-4 backdrop-blur-sm",
      isError ? "border-destructive/30" : "border-border",
    )}>
      <div className="mt-0.5 shrink-0">
        {isError ? (
          <AlertCircle className="size-4 text-destructive" />
        ) : (
          <FileText className="size-4 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
            inferredType ? "opacity-70" : "",
            docTypeBadgeColor(effectiveType, isProcessing),
          )}>
            {inferredType && <span className="opacity-60">~</span>}
            {typeLabel}
          </span>
          {isProcessing && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
              <Loader2 className="size-3 animate-spin" />
              {hasData ? null : t("processing")}
            </span>
          )}
          {(doc.amount_ron != null || !isProcessing) && (
            editingCost ? (
              <div className="ml-auto flex items-center gap-1">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitCost(); if (e.key === "Escape") setEditingCost(false); }}
                  className="h-6 w-24 px-1.5 text-xs"
                  placeholder="0.00"
                  autoFocus
                />
                <Button variant="ghost" size="icon" className="size-6" onClick={submitCost} disabled={saveCostMutation.isPending}>
                  {saveCostMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 text-green-400" />}
                </Button>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => setEditingCost(false)}>
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <button
                onClick={startEditCost}
                className="group ml-auto flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground"
                aria-label={t("edit_cost_btn")}
              >
                <span>{doc.amount_ron != null ? formatRon(doc.amount_ron) : <span className="text-xs font-normal text-muted-foreground/50">{t("add_cost_btn")}</span>}</span>
                <Pencil className="size-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )
          )}
        </div>

        {isError && (
          <p className="text-xs text-destructive">{t("error_processing")}</p>
        )}
        {needsReview && (
          <p className="text-xs text-amber-400">{t("needs_review")}</p>
        )}

        {doc.issuer && INSOLVENT_INSURERS.has(doc.issuer) && (
          <p className="text-xs font-medium text-red-400">{t("insolvent_issuer_warning")}</p>
        )}

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
          <p className={cn("flex items-center gap-1 text-xs", expiryColorClass)}>
            {days !== null && days > 0 && days <= 7 && (
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-400" />
            )}
            {days !== null && days <= 0 && (
              <span className="inline-block size-1.5 rounded-full bg-destructive" />
            )}
            {t("expiry_label")}: {formatDate(doc.valid_until, locale)}
            {expiryText && <span className="ml-1">· {expiryText}</span>}
          </p>
        )}

        {doc.document_type === "rca" && days !== null && days <= 45 && (
          <a
            href="https://iasig.ro"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs text-blue-400 hover:underline"
          >
            {t("renew_rca_link")}
          </a>
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

function NonVehicleCard({ doc, onDelete }: { doc: VaultDocument; onDelete: (id: string) => void }) {
  const t = useTranslations("documents");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      onDelete(doc.id);
      toast.success(t("non_vehicle_deleted"));
    } catch {
      toast.error(t("delete_error"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-400">{t("non_vehicle_title")}</p>
        <p className="text-xs text-muted-foreground">{t("non_vehicle_hint")}</p>
        {doc.original_filename && (
          <p className="mt-1 truncate text-xs text-muted-foreground/60">{doc.original_filename}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {doc.view_url && (
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a href={doc.view_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-amber-400 hover:text-destructive"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function CoverageShield({ docs }: { docs: VaultDocument[] }) {
  const t = useTranslations("documents");

  const doneDocs = docs.filter((d) => d.status === "done" || d.status === "needs_review");
  const validMandatory = new Set(
    doneDocs
      .filter((d) => d.document_type && MANDATORY_TYPES.has(d.document_type) && (d.days_until_expiry === null || d.days_until_expiry > 0))
      .map((d) => d.document_type),
  );
  const score = Math.round((validMandatory.size / MANDATORY_TYPES.size) * 100);
  const missing = MANDATORY_TYPES.size - validMandatory.size;

  const color = score >= 100 ? "#22c55e" : score >= 67 ? "#f59e0b" : "#ef4444";
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
      <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0 -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
        <circle
          cx="24" cy="24" r={radius} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold" style={{ color }}>{score}%</span>
          <span className="text-xs text-muted-foreground">{t("coverage_score_label")}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground/80">
          {missing === 0 ? t("coverage_score_complete") : t("coverage_score_missing", { count: missing })}
        </p>
      </div>
    </div>
  );
}

function CostSummary({ docs }: { docs: VaultDocument[] }) {
  const t = useTranslations("documents");

  const docsWithCost = docs.filter((d) => d.amount_ron != null && d.status !== "error");
  if (docsWithCost.length === 0) return null;

  const total = docsWithCost.reduce((sum, d) => sum + (d.amount_ron ?? 0), 0);
  const expiringSoon = docs.filter((d) => d.days_until_expiry !== null && d.days_until_expiry >= 1 && d.days_until_expiry <= 30).length;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
      <Receipt className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 space-y-0.5">
        <p className="text-xs text-muted-foreground">{t("total_costs_label", { count: docsWithCost.length })}</p>
        {expiringSoon > 0 && (
          <p className="text-xs text-amber-400">{t("expiring_soon_count", { count: expiringSoon })}</p>
        )}
      </div>
      <span className="text-sm font-semibold text-foreground">{formatRon(total)}</span>
    </div>
  );
}

function GroupSection({
  label,
  docs,
  onDelete,
  onUpdated,
  locale,
  vehicleId,
}: {
  label: string;
  docs: VaultDocument[];
  onDelete: (id: string) => void;
  onUpdated: () => void;
  locale: string;
  vehicleId: string;
}) {
  if (docs.length === 0) return null;
  const sorted = [...docs].sort((a, b) => {
    const aProcessing = a.status === "pending" || a.status === "processing";
    const bProcessing = b.status === "pending" || b.status === "processing";
    if (aProcessing && !bProcessing) return -1;
    if (!aProcessing && bProcessing) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-2">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{label}</p>
      {sorted.map((doc) => (
        <DocCard key={doc.id} doc={doc} onDelete={onDelete} onUpdated={onUpdated} locale={locale} vehicleId={vehicleId} />
      ))}
    </div>
  );
}

export function DocumentsClient({ headingText }: DocumentsClientProps) {
  const t = useTranslations("documents");
  const locale = useLocale();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { selectedVehicleId: vehicleId } = useVehicleContext();
  const { data: docs, isLoading: docsLoading } = useVaultDocuments(vehicleId);

  async function handleUpload(file: File) {
    if (!vehicleId) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("upload_error_too_large"));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("vehicleId", vehicleId);
      form.append("vault", "1");
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        toast.error(data.message ?? t("upload_error"));
        return;
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
    void qc.invalidateQueries({ queryKey: ["documents", vehicleId] });
  }

  function handleUpdated() {
    void qc.invalidateQueries({ queryKey: ["vault-documents", vehicleId] });
    void qc.invalidateQueries({ queryKey: ["documents", vehicleId] });
  }

  const nonVehicleDocs = docs?.filter((d) => d.is_non_vehicle) ?? [];
  const vehicleDocs = docs?.filter((d) => !d.is_non_vehicle) ?? [];

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, docs: vehicleDocs.filter((d) => getCategory(d) === cat) }))
    .filter((g) => g.docs.length > 0);

  return (
    <PageWrapper className="mx-auto max-w-2xl gap-4 pb-28">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{headingText}</h1>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {vehicleId && docs && docs.length > 0 && (
            <Button variant="ghost" size="icon" className="size-9" asChild title={t("calendar_export_btn")}>
              <a href={`/api/vehicles/${vehicleId}/vault/calendar`} download>
                <CalendarDays className="size-4 text-muted-foreground" />
              </a>
            </Button>
          )}
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !vehicleId}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            <span className="hidden sm:inline">{t("upload_btn")}</span>
          </Button>
        </div>
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
        <>
          {nonVehicleDocs.length > 0 && (
            <div className="space-y-2">
              {nonVehicleDocs.map((doc) => (
                <NonVehicleCard key={doc.id} doc={doc} onDelete={handleDelete} />
              ))}
            </div>
          )}
          <CoverageShield docs={vehicleDocs} />
          <CostSummary docs={vehicleDocs} />
          <div className="space-y-5">
            {grouped.map((g) => (
              <GroupSection key={g.cat} label={t(CATEGORY_I18N[g.cat])} docs={g.docs} onDelete={handleDelete} onUpdated={handleUpdated} locale={locale} vehicleId={vehicleId ?? ""} />
            ))}
          </div>
        </>
      )}

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        {t("email_hint")}
      </div>
    </PageWrapper>
  );
}
