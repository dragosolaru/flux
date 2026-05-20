"use client";

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Upload, FileImage, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_MIME_TYPES } from "@/lib/ai/prompts/document-extraction";

interface DocumentUploadZoneProps {
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

const ACCEPT = SUPPORTED_MIME_TYPES.join(",");
const MAX_MB = 10;

export function DocumentUploadZone({ onUpload, disabled }: DocumentUploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`Fișierul depășește ${MAX_MB} MB`);
        return;
      }
      if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(file.type)) {
        setError("Format nesupportat. Folosește JPG, PNG, WebP sau PDF.");
        return;
      }
      setUploading(true);
      try {
        await onUpload(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload eșuat");
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload document"
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
        (disabled || uploading) && "pointer-events-none opacity-60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onChange}
        className="hidden"
        disabled={disabled || uploading}
      />

      {uploading ? (
        <Loader2 className="size-8 animate-spin text-primary" />
      ) : (
        <div className="flex gap-2 text-muted-foreground">
          <FileImage className="size-8" />
          <Upload className="size-8" />
          <FileText className="size-8" />
        </div>
      )}

      <div>
        <p className="text-sm font-medium">
          {uploading ? "Se uploadează…" : "Trage factura sau bonul aici"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          JPG, PNG, WebP sau PDF · max {MAX_MB} MB
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
