"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";

const SCENARIOS = ["commuter", "weekend-errands", "road-trip", "vacation"] as const;
type ScenarioId = typeof SCENARIOS[number];

interface ScenarioPickerProps {
  vehicleId: string;
  currentScenarioId: string | null;
}

export function ScenarioPicker({ vehicleId, currentScenarioId }: ScenarioPickerProps) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ScenarioId>(
    (currentScenarioId as ScenarioId) ?? "commuter",
  );
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ScenarioId;
    setSelected(next);
    startTransition(async () => {
      await apiFetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify({ scenarioId: next }),
      });
      // Invalidate vehicle state so dashboard reflects new scenario immediately
      await qc.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={handleChange}
        disabled={isPending}
        className={cn(
          "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm",
          "disabled:opacity-50",
        )}
      >
        {SCENARIOS.map((id) => (
          <option key={id} value={id}>
            {t(`scenarios.${id}.label`)}
          </option>
        ))}
      </select>
      {isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
