"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function DisconnectVehicleButton({ vehicleId }: { vehicleId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onClick() {
    if (!confirm("Disconnect this vehicle from Flux?")) return;
    setPending(true);
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "DELETE",
    });
    setPending(false);
    if (res.ok) {
      toast.success("Vehicle disconnected");
      router.replace("/connect/tesla");
    } else {
      toast.error("Could not disconnect vehicle");
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
