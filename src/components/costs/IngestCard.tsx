"use client";

import { Camera, Check, Copy, Mail, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cardVariants } from "@/lib/animations/variants";
import { cn } from "@/lib/utils";

interface IngestCardProps {
  email: string | null;
  onUpload: (file: File) => Promise<void> | void;
  disabled?: boolean;
}

export function IngestCard({ email, onUpload, disabled }: IngestCardProps) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  function pickFile() {
    if (!disabled) fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await onUpload(file);
    e.target.value = "";
  }

  async function copyEmail() {
    if (!email) return;
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div variants={cardVariants}>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">{t("ingest.title")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("ingest.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFile}
              className="hidden"
              disabled={disabled}
            />

            <Option
              icon={<Camera className="size-5" />}
              label={t("ingest.option.upload.label")}
              hint={t("ingest.option.upload.description")}
              onClick={pickFile}
              disabled={disabled}
              hovered={hoveredKey === "upload"}
              onHoverChange={(h) => setHoveredKey(h ? "upload" : null)}
            />

            <Option
              icon={<Mail className="size-5" />}
              label={t("ingest.option.email.label")}
              hint={email ?? "—"}
              monoHint
              onClick={email ? copyEmail : undefined}
              disabled={!email}
              trailing={
                email ? (
                  copied ? (
                    <Check className="size-3.5 text-chart-2" />
                  ) : (
                    <Copy className="size-3.5 text-muted-foreground" />
                  )
                ) : null
              }
              hovered={hoveredKey === "email"}
              onHoverChange={(h) => setHoveredKey(h ? "email" : null)}
            />

            <Option
              icon={<MessageCircle className="size-5" />}
              label={t("ingest.option.whatsapp.label")}
              hint={t("ingest.option.whatsapp.description")}
              disabled
              hovered={false}
              onHoverChange={() => undefined}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface OptionProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  monoHint?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  hovered: boolean;
  onHoverChange: (hovered: boolean) => void;
}

function Option({
  icon,
  label,
  hint,
  monoHint,
  onClick,
  disabled,
  trailing,
  hovered,
  onHoverChange,
}: OptionProps) {
  const interactive = !disabled && onClick != null;
  const Tag = interactive ? motion.button : motion.div;
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        interactive
          ? "hover:border-primary/50 hover:bg-accent"
          : "opacity-60",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
          hovered ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div
          className={cn(
            "mt-0.5 truncate text-xs text-muted-foreground",
            monoHint && "font-mono",
          )}
          title={monoHint ? hint : undefined}
        >
          {hint}
        </div>
      </div>
      {trailing && <div className="mt-0.5">{trailing}</div>}
    </Tag>
  );
}
