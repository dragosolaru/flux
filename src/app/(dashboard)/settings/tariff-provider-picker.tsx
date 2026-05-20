"use client";

import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-fetch";

interface TariffProviderPickerProps {
  activeProvider: string;
  providers: { id: string; displayName: string }[];
}

export function TariffProviderPicker({ activeProvider, providers }: TariffProviderPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(activeProvider);

  async function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const providerId = e.target.value;
    setSelected(providerId);
    try {
      await apiFetch("/api/tariffs/settings", {
        method: "PUT",
        body: JSON.stringify({ providerId }),
      });
      startTransition(() => router.refresh());
      toast.success("Tariff provider updated");
    } catch {
      toast.error("Failed to update tariff provider");
      setSelected(activeProvider);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={selected}
        onChange={handleChange}
        disabled={isPending}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.displayName}</option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Mock data only — no real API keys required.
      </p>
    </div>
  );
}
