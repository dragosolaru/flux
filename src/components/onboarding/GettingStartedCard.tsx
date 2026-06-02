"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, X } from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";

const DISMISSED_KEY = "flux-onboarding-dismissed";

export interface ChecklistData {
  hasVehicle: boolean;
  hasDocument: boolean;
  hasHomeLocation: boolean;
  hasMockVehicle: boolean;
}

interface Props {
  data: ChecklistData;
}

export function GettingStartedCard({ data }: Props) {
  const t = useTranslations("getting_started");
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem(DISMISSED_KEY) === "1"
  );

  const allDone = data.hasVehicle && data.hasDocument && data.hasHomeLocation;

  if (dismissed || allDone) return null;

  return (
    <GlassCard animate={false} className="relative p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold">{t("title")}</p>
        <button
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, "1");
            setDismissed(true);
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
          <span className="sr-only">{t("dismiss")}</span>
        </button>
      </div>

      <ul className="space-y-2.5">
        <Step done={data.hasVehicle} label={t("step_vehicle")} href="/garage" />
        <Step done={data.hasDocument} label={t("step_receipt")} href="/costs" />
        <Step
          done={data.hasHomeLocation}
          label={t("step_home")}
          href="/settings#home-location"
        />
        {data.hasMockVehicle && (
          <Step done={false} label={t("step_explore")} href="/settings" optional />
        )}
      </ul>
    </GlassCard>
  );
}

function Step({
  done,
  label,
  href,
  optional,
}: {
  done: boolean;
  label: string;
  href: string;
  optional?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {done ? (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
      ) : (
        <Circle className="size-4 shrink-0 text-muted-foreground" />
      )}
      {done || optional ? (
        <span className={done ? "text-muted-foreground line-through" : ""}>{label}</span>
      ) : (
        <Link href={href} className="underline underline-offset-2 hover:text-foreground">
          {label}
        </Link>
      )}
    </li>
  );
}
