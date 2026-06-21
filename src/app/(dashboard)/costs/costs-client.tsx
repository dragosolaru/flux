"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  Car,
  Download,
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
import { useQueryClient } from "@tanstack/react-query";
import { cardVariants, fadeInUp, staggerContainer } from "@/lib/animations/variants";
import {
  SectionHeader,
  Card,
  StatTile,
} from "@/components/ui-kit";
import type { CostAggregation, MonthlyBucket, Document } from "@/types/costs";
import { cn } from "@/lib/utils";

interface CostsClientProps {
  vehicleId: string;
  vehicleName: string;
  vehicleEmail: string | null;
}

interface CostsResponse extends CostAggregation {
  petrolEquivalentCostRon: number;
  totalKm: number;
}

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

type MoneyFormatter = (amount: number, maxFractionDigits?: number) => string;

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

// ─── Main component ───────────────────────────────────────────────────────────

export function CostsClient({ vehicleId, vehicleName, vehicleEmail }: CostsClientProps) {
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

  const [showIngest, setShowIngest] = useState(false);

  const now = new Date();
  const docsThisMonth =
    documents?.filter((d) => {
      const created = new Date(d.created_at);
      return (
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth()
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
  const hasDocuments = !docsLoading && documents && documents.length > 0;
  const noDocuments = !docsLoading && (!documents || documents.length === 0);

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
      {(showIngest || noDocuments) && (
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
      {hasDocuments ? (
        <TimelineDocList
          documents={documents}
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
      ) : noDocuments ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <Receipt className="size-10 opacity-30" />
          <p className="text-sm">{t("no_docs_title")}</p>
          <p className="text-xs">{t("no_docs_hint")}</p>
        </div>
      ) : null}

      {/* FAB — floating action button, above bottom nav (64px) */}
      <motion.button
        aria-label={t("fab_label")}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowIngest((v) => !v)}
        className="fixed bottom-24 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-6" />
      </motion.button>
    </PageWrapper>
  );
}
