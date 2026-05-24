"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Download, Inbox, Loader2, Receipt } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { DocumentStatusCard } from "@/components/costs/DocumentStatusCard";
import { CostDashboard } from "@/components/costs/CostDashboard";
import { IngestCard } from "@/components/costs/IngestCard";
import { Button } from "@/components/ui/button";
import {
  useDocuments,
  useUploadDocument,
  useEditDocument,
  useRecoverDocuments,
} from "@/hooks/useDocuments";
import { useCosts } from "@/hooks/useCosts";
import { useQueryClient } from "@tanstack/react-query";
import { pageVariants, staggerContainer } from "@/lib/animations/variants";

interface CostsClientProps {
  vehicleId: string;
  vehicleName: string;
  vehicleEmail: string | null;
}

export function CostsClient({ vehicleId, vehicleName, vehicleEmail }: CostsClientProps) {
  const t = useTranslations("costs");
  const qc = useQueryClient();
  const { data: documents, isLoading: docsLoading } = useDocuments(vehicleId);
  const { data: costs, isLoading: costsLoading } = useCosts(vehicleId);
  const { mutateAsync: upload, isPending: uploading } = useUploadDocument(vehicleId);
  const { mutate: editDocument } = useEditDocument(vehicleId);
  const { mutate: recover, isPending: recovering, data: recoverResult } = useRecoverDocuments(vehicleId);

  // Invalidate costs when any document transitions out of pending/processing.
  // The ref is keyed implicitly to vehicleId; reset it when the user switches
  // vehicles to avoid invalidating the new vehicle based on the old one's state.
  const prevHadPending = useRef(false);
  useEffect(() => {
    prevHadPending.current = false;
  }, [vehicleId]);
  useEffect(() => {
    const hasPending = documents?.some(
      (d) => d.status === "pending" || d.status === "processing",
    ) ?? false;
    if (prevHadPending.current && !hasPending) {
      void qc.invalidateQueries({ queryKey: ["costs", vehicleId] });
    }
    prevHadPending.current = hasPending;
  }, [documents, vehicleId, qc]);

  async function handleUpload(file: File) {
    try {
      await upload(file);
      toast.success("Document adăugat — se procesează…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload eșuat");
    }
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto flex max-w-5xl flex-col gap-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("page_title")}</h1>
          <p className="text-sm text-muted-foreground">{vehicleName}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          asChild
        >
          <a href={`/api/costs/export?vehicleId=${vehicleId}`} download>
            <Download className="size-4" />
            {t("export_csv")}
          </a>
        </Button>
      </div>

      <CostDashboard data={costs} isLoading={costsLoading} />

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
        <IngestCard email={vehicleEmail} onUpload={handleUpload} disabled={uploading} uploading={uploading} />

        <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-2 text-xs">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Inbox className="size-3.5" />
            {t("missing_email_docs")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => recover()}
            disabled={recovering}
          >
            {recovering && <Loader2 className="size-3 animate-spin" />}
            {recoverResult ? t("recovered", { count: recoverResult.recovered }) : t("recover")}
          </Button>
        </div>
      </motion.div>

      {!docsLoading && documents && documents.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Documente procesate</h2>
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentStatusCard
                key={doc.id}
                doc={doc}
                onEdit={(id, updates) => editDocument({ documentId: id, updates })}
              />
            ))}
          </div>
        </div>
      )}

      {!docsLoading && (!documents || documents.length === 0) && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <Receipt className="size-10 opacity-30" />
          <p className="text-sm">{t("no_docs_title")}</p>
          <p className="text-xs">{t("no_docs_hint")}</p>
        </div>
      )}
    </motion.div>
  );
}
