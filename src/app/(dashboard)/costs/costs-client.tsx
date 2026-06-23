"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  Car,
  Download,
  ExternalLink,
  Fuel,
  Gauge,
  Home,
  Inbox,
  Loader2,
  Plus,
  Receipt,
  TrendingUp,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { DocumentStatusCard } from "@/components/costs/DocumentStatusCard";
import { IngestCard } from "@/components/costs/IngestCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageWrapper } from "@/components/layout/page-wrapper";
import {
  useDocuments,
  useUploadDocument,
  useEditDocument,
  useDeleteDocument,
  useRecoverDocuments,
} from "@/hooks/useDocuments";
import { useCosts } from "@/hooks/useCosts";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useCurrency } from "@/hooks/useCurrency";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { useVaultDocuments } from "@/hooks/useVaultDocuments";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import * as documentsApi from "@/lib/api/documents";
import { cardVariants, fadeInUp, staggerContainer } from "@/lib/animations/variants";
import {
  SectionHeader,
  Card,
  StatTile,
} from "@/components/ui-kit";
import type { CostAggregation, MonthlyBucket, Document, VaultDocument } from "@/types/costs";
import { cn } from "@/lib/utils";
import { vehicleInboxAddress } from "@/lib/costs/vehicle-email";

type CostsClientProps = Record<string, never>;

interface CostsResponse extends CostAggregation {
  petrolEquivalentCostRon: number;
  totalKm: number;
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

type MoneyFormatter = (amount: number, maxFractionDigits?: number) => string;

const CAR_DOC_TYPES = ["rca", "casco", "itp", "rovinieta", "vignette", "bridge_toll", "car_tax", "service", "parking"];

// ─── KPI chip data builder ────────────────────────────────────────────────────

interface KpiItem {
  icon: ComponentType<{ className?: string }>;
  value: string;
  label: string;
  accent?: string;
}

function buildKpiItems(
  data: CostsResponse,
  t: ReturnType<typeof useTranslations<"costs">>,
  fromRON: MoneyFormatter,
): KpiItem[] {
  const items: KpiItem[] = [];
  const hasData = data.totalCostRon > 0;

  items.push({
    icon: TrendingUp,
    value: fromRON(data.totalCostRon),
    label: t("kpi_total_lei"),
    accent: "text-primary",
  });

  items.push({
    icon: Zap,
    value: `${fmt(data.totalKwh, 1)} kWh`,
    label: t("kpi_total_kwh"),
    accent: "text-chart-2",
  });

  const splitHomePct =
    data.totalKwh > 0 ? Math.round((data.homeKwh / data.totalKwh) * 100) : null;
  items.push({
    icon: Home,
    value: splitHomePct != null ? `${splitHomePct}%` : "—",
    label: t("kpi_home_pct"),
    accent: "text-chart-2",
  });

  items.push({
    icon: Car,
    value:
      data.costPerKmBlended != null
        ? fromRON(data.costPerKmBlended, 3)
        : hasData
          ? t("no_data")
          : "—",
    label: t("kpi_cost_per_km_blended"),
    accent: "text-primary",
  });

  items.push({
    icon: Gauge,
    value: data.whPerKm != null ? `${fmt(data.whPerKm, 0)} Wh/km` : "—",
    label: t("kpi_wh_per_km_label"),
    accent: "text-chart-3",
  });

  const savingsRon = data.petrolEquivalentCostRon - data.totalCostRon;
  items.push({
    icon: Fuel,
    value:
      hasData && data.totalKm > 0 && data.petrolEquivalentCostRon > 0
        ? savingsRon > 0
          ? fromRON(savingsRon)
          : savingsRon < 0
            ? `-${fromRON(-savingsRon)}`
            : fromRON(0)
        : "—",
    label: t("kpi_fuel_saving"),
    accent:
      savingsRon > 0
        ? "text-chart-2"
        : savingsRon < 0
          ? "text-destructive"
          : "text-muted-foreground",
  });

  return items;
}

// ─── Monthly bar chart ────────────────────────────────────────────────────────

function MonthlyBarChart({ months }: { months: MonthlyBucket[] }) {
  const t = useTranslations("costs");
  const { fromRON } = useCurrency();
  if (months.length === 0) return null;

  const visible = months.slice(-12);
  const maxCost = Math.max(...visible.map((m) => m.costRon), 1);
  const rawMonths = t.raw("months");
  const MONTH_NAMES: string[] = Array.isArray(rawMonths)
    ? (rawMonths as string[])
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <motion.div variants={cardVariants}>
      <Card variant="surface" className="overflow-visible p-4">
        <SectionHeader title={t("chart_monthly_trend")} icon={TrendingUp} />

        <div className="relative mt-3">
          <div className="flex h-28 items-end gap-1 pb-6">
            {visible.map((m) => {
              const monthIdx = parseInt(m.month.slice(5)) - 1;
              const label = MONTH_NAMES[monthIdx] ?? m.month.slice(5);
              const heightPct = (m.costRon / maxCost) * 100;

              return (
                <div
                  key={m.month}
                  className="group relative flex flex-1 flex-col items-center justify-end"
                  style={{ height: "100%" }}
                >
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: m.costRon > 0 ? 3 : 0,
                      background:
                        "linear-gradient(to bottom, var(--chart-1), var(--chart-2))",
                      opacity: 0.9,
                    }}
                  />
                  <span className="absolute -bottom-5 left-0 right-0 text-center text-[9px] tabular-nums text-muted-foreground">
                    {label}
                  </span>
                  <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg group-hover:block">
                    <span className="font-semibold tabular-nums">{fromRON(m.costRon, 0)}</span>
                    <span className="ml-1 tabular-nums text-muted-foreground">· {m.kwh.toFixed(1)} kWh</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ─── KPI chips row ────────────────────────────────────────────────────────────

function KpiChipsRow({ data }: { data: CostsResponse }) {
  const t = useTranslations("costs");
  const { fromRON } = useCurrency();
  const items = buildKpiItems(data, t, fromRON);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto scrollbar-none pb-1"
    >
      {items.map((item) => (
        <motion.div key={item.label} variants={fadeInUp} className="snap-center">
          <StatTile
            icon={item.icon}
            value={item.value}
            label={item.label}
            accent={item.accent}
            className="min-w-[100px]"
          />
        </motion.div>
      ))}
    </motion.div>
  );
}

function KpiChipsSkeleton() {
  return (
    <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[88px] min-w-[100px] rounded-2xl" />
      ))}
    </div>
  );
}

// ─── Timeline document list ───────────────────────────────────────────────────

type DocStatus = "done" | "needs_review" | "error" | "pending" | "processing";

function timelineDot(status: DocStatus): string {
  if (status === "done") return "bg-chart-2";
  if (status === "needs_review") return "bg-chart-3";
  if (status === "error") return "bg-destructive";
  return "bg-muted-foreground";
}

function timelineLine(status: DocStatus): string {
  if (status === "done") return "bg-chart-2/30";
  if (status === "needs_review") return "bg-chart-3/30";
  if (status === "error") return "bg-destructive/30";
  return "bg-muted/30";
}

interface TimelineDocListProps {
  documents: Document[];
  onEdit: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}

function TimelineDocList({ documents, onEdit, onDelete }: TimelineDocListProps) {
  const t = useTranslations("costs");

  return (
    <div className="space-y-2.5">
      <SectionHeader title={t("docs_heading")} icon={Receipt} />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-2"
      >
        {documents.map((doc, idx) => {
          const status = doc.status as DocStatus;
          const isLast = idx === documents.length - 1;

          return (
            <motion.div key={doc.id} variants={fadeInUp} className="flex gap-3">
              {/* Timeline column */}
              <div className="flex w-5 flex-col items-center pt-3">
                <div className={cn("size-2.5 shrink-0 rounded-full", timelineDot(status))} />
                {!isLast && (
                  <div className={cn("mt-1 w-0.5 flex-1", timelineLine(status))} />
                )}
              </div>

              {/* Card */}
              <div className="min-w-0 flex-1 pb-2">
                <DocumentStatusCard
                  doc={doc}
                  onEdit={(id, updates) => onEdit(id, updates)}
                  onDelete={(id) => onDelete(id)}
                />
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── Auto total cost stat ─────────────────────────────────────────────────────

function AutoTotalStat({ amountRon }: { amountRon: number }) {
  const t = useTranslations("costs");
  const { fromRON } = useCurrency();
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1"
    >
      <motion.div variants={fadeInUp}>
        <StatTile
          icon={Car}
          value={fromRON(amountRon)}
          label={t("auto_total_cost")}
          accent="text-primary"
          className="min-w-[100px]"
        />
      </motion.div>
    </motion.div>
  );
}

// ─── Auto tab vault doc card ──────────────────────────────────────────────────

function VaultDocCard({ doc }: { doc: VaultDocument }) {
  const tDocs = useTranslations("documents");
  const { fromRON } = useCurrency();

  const typeLabel: Record<string, string> = {
    rca: tDocs("type_rca"),
    casco: tDocs("type_casco"),
    itp: tDocs("type_itp"),
    rovinieta: tDocs("type_rovinieta"),
    vignette: tDocs("type_vignette"),
    bridge_toll: tDocs("type_bridge_toll"),
    car_tax: tDocs("type_car_tax"),
    service: tDocs("type_service"),
    parking: tDocs("type_parking"),
    fuel: tDocs("type_fuel"),
    tires: tDocs("type_tires"),
    fine: tDocs("type_fine"),
    highway_toll: tDocs("type_highway_toll"),
    car_wash: tDocs("type_car_wash"),
    leasing: tDocs("type_leasing"),
    roadside_assistance: tDocs("type_roadside_assistance"),
    spare_parts: tDocs("type_spare_parts"),
    ferry: tDocs("type_ferry"),
    other: tDocs("type_other"),
  };

  const label = doc.document_type ? (typeLabel[doc.document_type] ?? doc.document_type) : "—";

  const isExpired = doc.days_until_expiry != null && doc.days_until_expiry < 0;
  const isExpiringSoon = !isExpired && doc.days_until_expiry != null && doc.days_until_expiry <= 30;

  return (
    <Card variant="surface" className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {label}
            </span>
            {doc.status === "processing" || doc.status === "pending" ? (
              <span className="text-xs text-muted-foreground">{tDocs("processing")}</span>
            ) : isExpired ? (
              <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {tDocs("expired_label")}
              </span>
            ) : isExpiringSoon ? (
              <span className="rounded-md bg-chart-3/10 px-2 py-0.5 text-xs font-medium text-chart-3">
                {tDocs("expiring_soon")}
              </span>
            ) : null}
          </div>

          {doc.plate_number && (
            <p className="truncate text-xs text-muted-foreground">
              {tDocs("plate")}: <span className="font-mono font-medium text-foreground">{doc.plate_number}</span>
            </p>
          )}

          {doc.issuer && (
            <p className="truncate text-xs text-muted-foreground">
              {tDocs("issuer")}: {doc.issuer}
            </p>
          )}

          {doc.valid_until && (
            <p className="text-xs text-muted-foreground">
              {tDocs("expiry_label")}: {doc.valid_until.slice(0, 10)}
              {doc.days_until_expiry != null && doc.days_until_expiry >= 0 && (
                <span className="ml-1 text-muted-foreground">
                  ({tDocs("days_left", { days: doc.days_until_expiry })})
                </span>
              )}
            </p>
          )}
        </div>

        {doc.amount_ron != null && doc.amount_ron > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums">{fromRON(doc.amount_ron, 0)}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Manual entry form ────────────────────────────────────────────────────────

const ALL_CAR_TYPES = ["rca", "casco", "itp", "rovinieta", "vignette", "bridge_toll", "car_tax", "service", "parking", "fuel", "tires", "fine", "highway_toll", "car_wash", "leasing", "roadside_assistance", "spare_parts", "ferry", "other"] as const;
const TYPES_WITH_EXPIRY = ["rca", "casco", "itp", "rovinieta", "vignette", "leasing", "roadside_assistance"];

type ManualFormData = {
  document_type: string;
  amount_ron: number | null;
  valid_from: string | null;
  valid_until: string | null;
  issuer: string | null;
  plate_number: string | null;
};

function ManualEntryForm({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: (data: ManualFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const tDocs = useTranslations("documents");
  const tCosts = useTranslations("costs");
  const [docType, setDocType] = useState<string>("rca");
  const [amountRon, setAmountRon] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [issuer, setIssuer] = useState("");
  const [plateNumber, setPlateNumber] = useState("");

  const typeLabel = (type: string): string => {
    const map: Record<string, string> = {
      rca: tDocs("type_rca"),
      casco: tDocs("type_casco"),
      itp: tDocs("type_itp"),
      rovinieta: tDocs("type_rovinieta"),
      vignette: tDocs("type_vignette"),
      bridge_toll: tDocs("type_bridge_toll"),
      car_tax: tDocs("type_car_tax"),
      service: tDocs("type_service"),
      parking: tDocs("type_parking"),
      fuel: tDocs("type_fuel"),
      tires: tDocs("type_tires"),
      fine: tDocs("type_fine"),
      highway_toll: tDocs("type_highway_toll"),
      car_wash: tDocs("type_car_wash"),
      leasing: tDocs("type_leasing"),
      roadside_assistance: tDocs("type_roadside_assistance"),
      spare_parts: tDocs("type_spare_parts"),
      ferry: tDocs("type_ferry"),
      other: tDocs("type_other"),
    };
    return map[type] ?? type;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({
      document_type: docType,
      amount_ron: amountRon ? parseFloat(amountRon) : null,
      valid_from: validFrom || null,
      valid_until: TYPES_WITH_EXPIRY.includes(docType) ? (validUntil || null) : null,
      issuer: issuer.trim() || null,
      plate_number: plateNumber.trim() || null,
    });
  }

  const hasExpiry = TYPES_WITH_EXPIRY.includes(docType);

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <p className="text-sm font-medium">{tCosts("manual_form_title")}</p>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{tCosts("manual_type_label")}</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {ALL_CAR_TYPES.map((t) => (
            <option key={t} value={t}>{typeLabel(t)}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{tCosts("manual_amount_label")}</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amountRon}
          onChange={(e) => setAmountRon(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className={cn("grid gap-3", hasExpiry ? "grid-cols-2" : "grid-cols-1")}>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{tCosts("manual_date_label")}</label>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {hasExpiry && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{tCosts("manual_expiry_label")}</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{tCosts("manual_issuer_label")}</label>
        <input
          type="text"
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          placeholder={tCosts("manual_issuer_placeholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{tCosts("manual_plate_label")}</label>
        <input
          type="text"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
          placeholder="B 123 ABC"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="mr-1 size-3.5 animate-spin" />}
          {tCosts("manual_save_btn")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {tCosts("manual_cancel_btn")}
        </Button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CostsClient(_: CostsClientProps) {
  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicleId = selectedVehicleId ?? "";
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const vehicleName = vehicle ? (vehicle.nickname ?? vehicle.displayName) : "";
  const vehicleEmail = vehicleId ? vehicleInboxAddress(vehicleId) : null;

  const t = useTranslations("costs");
  const qc = useQueryClient();
  const { data: documents, isLoading: docsLoading } = useDocuments(vehicleId);
  const { data: costs, isLoading: costsLoading } = useCosts(vehicleId);
  const { mutateAsync: upload, isPending: uploading } = useUploadDocument(vehicleId);
  const { mutate: editDocument } = useEditDocument(vehicleId);
  const { mutate: deleteDocument } = useDeleteDocument(vehicleId);
  const { mutate: recover, isPending: recovering, data: recoverResult, reset: resetRecover } =
    useRecoverDocuments(vehicleId);
  const { data: capabilities } = useCapabilities();
  const { data: vaultDocs } = useVaultDocuments(vehicleId);

  const [showIngest, setShowIngest] = useState(false);
  const [activeTab, setActiveTab] = useState<"energy" | "auto">("energy");
  const [showManualForm, setShowManualForm] = useState(false);

  const { mutateAsync: createManualDoc, isPending: savingManual } = useMutation({
    mutationFn: (data: ManualFormData) => documentsApi.createManualVaultDoc(vehicleId, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vault-documents", vehicleId] }),
  });

  const now = new Date();
  const ENERGY_CAR_DOC_TYPES = new Set(["rca","casco","itp","rovinieta","vignette","bridge_toll","car_tax","service","parking","fuel","tires","fine","highway_toll","car_wash","leasing","roadside_assistance","spare_parts","ferry","talon"]);
  const docsThisMonth =
    documents?.filter((d) => {
      const created = new Date(d.created_at);
      return (
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth() &&
        !ENERGY_CAR_DOC_TYPES.has(d.document_type ?? "")
      );
    }).length ?? 0;

  // Invalidate costs when any document transitions out of pending/processing.
  // Reset per-vehicle so switching vehicles doesn't trigger spurious invalidation.
  const prevHadPending = useRef(false);
  useEffect(() => {
    prevHadPending.current = false;
    resetRecover(); // clear the previous vehicle's recovered-count from the button
  }, [vehicleId, resetRecover]);
  useEffect(() => {
    const hasPending =
      documents?.some((d) => d.status === "pending" || d.status === "processing") ?? false;
    if (prevHadPending.current && !hasPending) {
      void qc.invalidateQueries({ queryKey: ["costs", vehicleId] });
    }
    prevHadPending.current = hasPending;
  }, [documents, vehicleId, qc]);

  async function handleUpload(file: File) {
    try {
      await upload(file);
      toast.success(t("upload_success"));
      setShowIngest(false);
    } catch {
      toast.error(t("upload_error"));
    }
  }

  const costsData = costs as CostsResponse | undefined;

  // Filter energy docs: exclude vault-upload/manual source AND car doc types
  const energyDocs = documents?.filter(
    (d) => d.source !== "vault-upload" && d.source !== "manual" && !CAR_DOC_TYPES.includes(d.document_type ?? ""),
  );
  const hasEnergyDocs = !docsLoading && energyDocs && energyDocs.length > 0;
  const noEnergyDocs = !docsLoading && (!energyDocs || energyDocs.length === 0);

  const autoCostRon = (vaultDocs ?? []).reduce((sum, d) => sum + (d.amount_ron ?? 0), 0);

  return (
    <PageWrapper className="relative mx-auto max-w-2xl gap-4 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{t("page_title")}</h1>
          <p className="truncate text-xs text-muted-foreground">{vehicleName}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" asChild>
          <a href={`/api/costs/export?vehicleId=${vehicleId}`} download>
            <Download className="size-4" />
            <span className="hidden sm:inline">{t("export_csv")}</span>
          </a>
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
        <button
          onClick={() => setActiveTab("energy")}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
            activeTab === "energy"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("tab_energy")}
        </button>
        <button
          onClick={() => setActiveTab("auto")}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
            activeTab === "auto"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("tab_auto")}
        </button>
      </div>

      {activeTab === "energy" && (
        <>
          {/* KPI chips row */}
          {costsLoading ? (
            <KpiChipsSkeleton />
          ) : costsData ? (
            <KpiChipsRow data={costsData} />
          ) : null}

          {/* Monthly bar chart */}
          {costsData && costsData.monthlyTrend.length > 0 && (
            <MonthlyBarChart months={costsData.monthlyTrend} />
          )}

          {/* Email recovery banner */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <Inbox className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{t("missing_email_docs")}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-xs"
              onClick={() => recover()}
              disabled={recovering}
            >
              {recovering && <Loader2 className="size-3 animate-spin" />}
              {recoverResult ? t("recovered", { count: recoverResult.recovered }) : t("recover")}
            </Button>
          </div>

          {/* Ingest card: shown when FAB toggled or no docs yet */}
          {(showIngest || noEnergyDocs) && (
            <motion.div variants={cardVariants} initial="hidden" animate="visible">
              <IngestCard
                email={vehicleEmail}
                onUpload={handleUpload}
                disabled={uploading}
                uploading={uploading}
                hasProSubscription={capabilities?.hasProSubscription}
                docsThisMonth={docsThisMonth}
              />
            </motion.div>
          )}

          {/* Document timeline */}
          {hasEnergyDocs ? (
            <TimelineDocList
              documents={energyDocs}
              onEdit={(id, updates) =>
                editDocument(
                  { documentId: id, updates },
                  {
                    onSuccess: () => toast.success(t("edit_success")),
                    onError: () => toast.error(t("edit_error")),
                  },
                )
              }
              onDelete={(id) => {
                deleteDocument(id, {
                  onSuccess: () => toast.success(t("delete_success")),
                  onError: () => toast.error(t("delete_error")),
                });
              }}
            />
          ) : noEnergyDocs ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <Receipt className="size-10 opacity-30" />
              <p className="text-sm">{t("no_docs_title")}</p>
              <p className="text-xs">{t("no_docs_hint")}</p>
            </div>
          ) : null}
        </>
      )}

      {activeTab === "auto" && (
        <>
          {/* Auto total cost chip */}
          {autoCostRon > 0 && <AutoTotalStat amountRon={autoCostRon} />}

          {/* Vault documents list */}
          {vaultDocs && vaultDocs.length > 0 && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {vaultDocs.map((doc) => (
                <motion.div key={doc.id} variants={fadeInUp}>
                  <VaultDocCard doc={doc} />
                </motion.div>
              ))}
            </motion.div>
          )}

          {!vaultDocs?.length && !showManualForm && (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
              <Car className="size-10 opacity-30" />
              <p className="text-sm font-medium">{t("auto_empty_title")}</p>
              <p className="text-xs">{t("auto_empty_hint")}</p>
              <Button variant="outline" size="sm" asChild>
                <a href="/documents">
                  <ExternalLink className="size-3.5" />
                  {t("auto_go_to_docs")}
                </a>
              </Button>
            </div>
          )}

          {showManualForm ? (
            <ManualEntryForm
              saving={savingManual}
              onSave={async (data) => {
                await createManualDoc(data);
                setShowManualForm(false);
                toast.success(t("manual_save_success"));
              }}
              onCancel={() => setShowManualForm(false)}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowManualForm(true)}
            >
              <Plus className="size-4" />
              {t("auto_add_manual")}
            </Button>
          )}
        </>
      )}

      {/* FAB — only in energy tab, floating above bottom nav (64px) */}
      {activeTab === "energy" && (
        <motion.button
          aria-label={t("fab_label")}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowIngest((v) => !v)}
          className="fixed bottom-24 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-6" />
        </motion.button>
      )}
    </PageWrapper>
  );
}
