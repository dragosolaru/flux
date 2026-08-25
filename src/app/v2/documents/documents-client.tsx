"use client";

import { Plus } from "lucide-react";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Row, Rows, Screen, ScreenHeader, SectionLabel } from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import { useDocuments, useUploadDocument } from "@/hooks/useDocuments";
import { useVehicleContext } from "@/contexts/vehicle";
import type { Document, DocumentStatus } from "@/types/costs";

/** Status → the word and the colour on the right of the row. */
function statusTone(status: DocumentStatus): "muted" | "green" | "amber" | "red" {
  if (status === "done") return "green";
  if (status === "error") return "red";
  if (status === "needs_review") return "amber";
  return "muted";
}

function documentTitle(doc: Document, fallback: string): string {
  return doc.parsed_json?.issuer ?? doc.original_filename ?? fallback;
}

export function DocumentsV2Client() {
  const t = useTranslations("documents");
  const tc = useTranslations("costs");
  const tv = useTranslations("v2");
  const { selectedVehicleId } = useVehicleContext();
  const vehicleId = selectedVehicleId ?? "";
  const { data: documents = [], isLoading } = useDocuments(vehicleId);
  const upload = useUploadDocument(vehicleId);
  const fileInput = useRef<HTMLInputElement>(null);

  // Same 10 MB ceiling and same accept list as v1. Checked here as well as on
  // the server so a phone photo that is too large fails instantly instead of
  // after a slow upload on mobile data.
  function pick(file: File | undefined) {
    if (!file || !vehicleId) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("upload_error_too_large"));
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success(t("upload_success")),
      onError: () => toast.error(t("upload_error")),
    });
  }

  // Anything still moving goes on top: those are the ones you opened the screen
  // to check on, and they are also the ones that change under you.
  const working = documents.filter(
    (d) => d.status === "pending" || d.status === "processing" || d.status === "needs_review",
  );
  const settled = documents.filter((d) => d.status === "done" || d.status === "error");

  const statusLabel = (status: DocumentStatus): string =>
    tc(
      status === "done"
        ? "status_done"
        : status === "error"
          ? "status_error"
          : status === "needs_review"
            ? "status_needs_review"
            : status === "processing"
              ? "status_processing"
              : "status_pending",
    );

  return (
    <Screen>
      <ScreenHeader
        switcher={<VehicleSwitch />}
        title={t("heading")}
        meta={isLoading ? undefined : String(documents.length)}
      />

      {documents.length === 0 && !isLoading && (
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t("empty_hint")}</p>
      )}

      {working.length > 0 && (
        <div className="mt-6">
          <SectionLabel>{t("processing")}</SectionLabel>
          <Rows className="mt-2">
            {working.map((doc, i) => (
              <Row
                key={doc.id}
                label={documentTitle(doc, t("processing_type_placeholder"))}
                value={statusLabel(doc.status)}
                valueTone={statusTone(doc.status)}
                href="/documents"
                last={i === working.length - 1}
              />
            ))}
          </Rows>
        </div>
      )}

      {settled.length > 0 && (
        <div className="mt-7">
          <SectionLabel>{tc("processed_docs_heading")}</SectionLabel>
          <Rows className="mt-2">
            {settled.slice(0, 12).map((doc, i, shown) => (
              <Row
                key={doc.id}
                label={documentTitle(doc, t("type_other"))}
                value={statusLabel(doc.status)}
                valueTone={statusTone(doc.status)}
                href="/documents"
                last={i === shown.length - 1}
              />
            ))}
          </Rows>
        </div>
      )}

      <div className="mt-7 pb-8">
        <Rows>
          {/* The picker is native; the row is the button. Reviewing a parsed
              document still happens on the v1 screen — that editor is a form
              with money in it, and a second one would drift. */}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              // Cleared so picking the same file twice still fires a change.
              e.target.value = "";
            }}
          />
          <Row
            icon={<Plus strokeWidth={1.5} className="text-primary" />}
            label={<span className="text-primary">{t("upload_btn")}</span>}
            value={tv("photo_or_email")}
            pending={upload.isPending}
            pendingLabel={tv("sending")}
            disabled={vehicleId === ""}
            reason={tv("no_answer")}
            onClick={() => fileInput.current?.click()}
            last
          />
        </Rows>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("email_hint")}</p>
      </div>

      <NavBar />
    </Screen>
  );
}
