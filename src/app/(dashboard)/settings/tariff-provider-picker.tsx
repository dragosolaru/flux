"use client";

import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

interface TariffProviderPickerProps {
  activeProvider: string;
  providers: { id: string; displayName: string }[];
}

export function TariffProviderPicker({ activeProvider, providers }: TariffProviderPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(activeProvider);
  const t = useTranslations("settings.tariff");

  async function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const providerId = e.target.value;
    setSelected(providerId);
    try {
      await apiFetch("/api/tariffs/settings", {
        method: "PUT",
        body: JSON.stringify({ providerId }),
      });
      startTransition(() => router.refresh());
      toast.success(t("updated"));
    } catch {
      toast.error(t("updateError"));
      setSelected(activeProvider);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <select
          className="w-full appearance-none rounded-md border bg-background px-3 py-2 pr-8 text-sm"
          value={selected}
          onChange={handleChange}
          disabled={isPending}
          aria-label={t("label")}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.displayName}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("mockNote")}
      </p>
    </div>
  );
}
