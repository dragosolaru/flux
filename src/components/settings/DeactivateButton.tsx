"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";

interface DeactivateButtonProps {
  vehicleId: string;
  label: string;
}

export function DeactivateButton({ vehicleId, label }: DeactivateButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await apiFetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      });
      router.refresh();
    } catch {
      // Network error — UI unchanged; user can retry
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}
