"use client";

import { Receipt } from "lucide-react";
import { DocumentUploadZone } from "@/components/costs/DocumentUploadZone";
import { DocumentStatusCard } from "@/components/costs/DocumentStatusCard";
import { CostDashboard } from "@/components/costs/CostDashboard";
import { useDocuments, useUploadDocument, useEditDocument } from "@/hooks/useDocuments";
import { useCosts } from "@/hooks/useCosts";

interface CostsClientProps {
  vehicleId: string;
  vehicleName: string;
  vehicleEmail: string;
}

export function CostsClient({ vehicleId, vehicleName, vehicleEmail }: CostsClientProps) {
  const { data: documents, isLoading: docsLoading } = useDocuments(vehicleId);
  const { data: costs, isLoading: costsLoading } = useCosts(vehicleId);
  const { mutateAsync: upload, isPending: uploading } = useUploadDocument(vehicleId);
  const { mutate: editDocument } = useEditDocument(vehicleId);

  async function handleUpload(file: File) {
    await upload(file);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Costuri</h1>
        <p className="text-sm text-muted-foreground">{vehicleName}</p>
      </div>

      {/* Dashboard */}
      <CostDashboard data={costs} isLoading={costsLoading} />

      {/* Upload */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Adaugă document</h2>
        <DocumentUploadZone onUpload={handleUpload} disabled={uploading} />

        {/* Email tip */}
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">📧 Trimite pe email</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Poți trimite facturi și bonuri la{" "}
            <span className="font-mono text-foreground">{vehicleEmail}</span>{" "}
            și vor apărea automat aici.
          </p>
        </div>
      </div>

      {/* Documents list */}
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
