"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-fetch";
import type { VehicleListItem } from "@/hooks/useVehicles";

const DISMISSED_KEY = "flux:mock-banner-dismissed";

export function MockGlobalBanner() {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => apiFetch<VehicleListItem[]>("/api/vehicles"),
    staleTime: 60_000,
  });

  const allMock =
    vehicles != null &&
    vehicles.length > 0 &&
    vehicles.every((v) => v.dataSource === "mock");

  if (!allMock || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
      <span>
        You are in{" "}
        <strong>Demo mode</strong> — all vehicles are simulated.{" "}
        <Link href="/about-data" className="underline underline-offset-2 hover:no-underline">
          Learn more
        </Link>
      </span>
      <button
        onClick={() => {
          sessionStorage.setItem(DISMISSED_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss banner"
        className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
