"use client";

import { Camera, Check, Copy, Loader2, Mail, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { GlassCard } from "@/components/ui/glass-card";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { cardVariants } from "@/lib/animations/variants";
import { cn } from "@/lib/utils";

const FREE_TIER_MAX = 3;

interface IngestCardProps {
  email: string | null;
  onUpload: (file: File) => Promise<void> | void;
  disabled?: boolean;
  uploading?: boolean;
  hasProSubscription?: boolean;
  docsThisMonth?: number;
}

export function IngestCard({
  email,
  onUpload,
  disabled,
  uploading,
  hasProSubscription,
  docsThisMonth = 0,
}: IngestCardProps) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const atFreeTierLimit = hasProSubscription === false && docsThisMonth >= FREE_TIER_MAX;
  const uploadDisabled = disabled || atFreeTierLimit;

  function pickFile() {
    if (!uploadDisabled) fileRef.current?.click();
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
      <GlassCard className="p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">{t("ingest.title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("ingest.subtitle")}</p>
        </div>

        {hasProSubscription === false && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {t("ingest.free_tier_usage", { used: docsThisMonth, max: FREE_TIER_MAX })}
            </p>
            {atFreeTierLimit && (
              <UpgradeButton
                label={t("ingest.upgrade_cta")}
                size="sm"
                variant="default"
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFile}
            className="hidden"
            disabled={uploadDisabled}
          />

          <Option
            icon={
              uploading
                ? <Loader2 className="size-4 animate-spin" />
                : <Camera className="size-4" />
            }
            label={t("ingest.option.upload.label")}
            hint={uploading ? t("ingest.option.upload.uploading") : t("ingest.option.upload.description")}
            onClick={pickFile}
            disabled={uploadDisabled}
          />

          <Option
            icon={<Mail className="size-4" />}
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
          />

          <Option
            icon={<MessageCircle className="size-4" />}
            label={t("ingest.option.whatsapp.label")}
            hint={t("ingest.option.whatsapp.description")}
            disabled
          />
        </div>
      </GlassCard>
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
}

function Option({
  icon,
  label,
  hint,
  monoHint,
  onClick,
  disabled,
  trailing,
}: OptionProps) {
  const interactive = !disabled && onClick != null;
  const Tag = interactive ? motion.button : motion.div;
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        interactive
          ? "hover:border-primary/50 hover:bg-accent"
          : "opacity-60",
      )}
    >
      <div className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
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
