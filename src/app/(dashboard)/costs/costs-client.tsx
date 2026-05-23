"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Inbox, Loader2, Mail, Receipt } from "lucide-react";
import { DocumentUploadZone } from "@/components/costs/DocumentUploadZone";
import { DocumentStatusCard } from "@/components/costs/DocumentStatusCard";
import { CostDashboard } from "@/components/costs/CostDashboard";
import { Button } from "@/components/ui/button";
import {
  useDocuments,
  useUploadDocument,
  useEditDocument,
  useRecoverDocuments,
} from "@/hooks/useDocuments";
import { useCosts } from "@/hooks/useCosts";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface CostsClientProps {
  vehicleId: string;
  vehicleName: string;
  vehicleEmail: string;
}

function EmailInbox({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Split into local@domain for nicer display
  const [local, domain] = email.split("@");

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Trimite pe email</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fotografiezi o factură sau bon și trimiți la adresa de mai jos — apare automat aici.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1 overflow-hidden rounded-md border bg-background px-2.5 py-1.5">
              <p className="truncate text-xs font-mono leading-none">
                <span className="text-foreground">{local}</span>
                <span className="text-muted-foreground">@{domain}</span>
              </p>
            </div>
            <button
              onClick={copy}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                copied
                  ? "border-chart-2/40 bg-chart-2/10 text-chart-2"
                  : "hover:bg-muted",
              )}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copiat!" : "Copiază"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CostsClient({ vehicleId, vehicleName, vehicleEmail }: CostsClientProps) {
  const qc = useQueryClient();
  const { data: documents, isLoading: docsLoading } = useDocuments(vehicleId);
  const { data: costs, isLoading: costsLoading } = useCosts(vehicleId);
  const { mutateAsync: upload, isPending: uploading } = useUploadDocument(vehicleId);
  const { mutate: editDocument } = useEditDocument(vehicleId);
  const { mutate: recover, isPending: recovering, data: recoverResult } = useRecoverDocuments(vehicleId);

  // Invalidate costs when any document transitions out of pending/processing.
  const prevHadPending = useRef(false);
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
    await upload(file);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Costuri</h1>
        <p className="text-sm text-muted-foreground">{vehicleName}</p>
      </div>

      <CostDashboard data={costs} isLoading={costsLoading} />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Adaugă document</h2>
        <DocumentUploadZone onUpload={handleUpload} disabled={uploading} />
        <EmailInbox email={vehicleEmail} />

        <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-2 text-xs">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Inbox className="size-3.5" />
            Lipsesc documente trimise pe email?
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => recover()}
            disabled={recovering}
          >
            {recovering && <Loader2 className="size-3 animate-spin" />}
            {recoverResult ? `Recuperate: ${recoverResult.recovered}` : "Recuperează"}
          </Button>
        </div>
      </div>

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
          <p className="text-sm">Niciun document încă.</p>
          <p className="text-xs">Uploadează prima factură sau bon pentru a vedea costurile.</p>
        </div>
      )}
    </div>
  );
}
