"use client";

import { Camera, Check, Copy, Loader2, Mail, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useState } from "react";

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
  const [copied, setCopied] = useState(false);

  const atFreeTierLimit = hasProSubscription === false && docsThisMonth >= FREE_TIER_MAX;
  const uploadDisabled = disabled || atFreeTierLimit;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await onUpload(file);
    e.target.value = "";
  }

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
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
          {/* Use <label> wrapping the hidden input — guaranteed to open file picker on iOS/Android without programmatic .click() */}
          <motion.label
            whileTap={!uploadDisabled ? { scale: 0.97 } : undefined}
            className={cn(
              "flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              !uploadDisabled ? "hover:border-primary/50 hover:bg-accent" : "pointer-events-none opacity-60",
            )}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFile}
              className="hidden"
              disabled={uploadDisabled}
            />
            <div className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("ingest.option.upload.label")}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {uploading ? t("ingest.option.upload.uploading") : t("ingest.option.upload.description")}
              </div>
            </div>
          </motion.label>

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
