"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function DisconnectVehicleButton({ vehicleId }: { vehicleId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const t = useTranslations("settings.disconnect");

  async function onClick() {
    if (!confirm(t("confirm"))) return;
    setPending(true);
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "DELETE",
    });
    setPending(false);
    if (res.ok) {
      toast.success(t("success"));
      router.replace("/connect/tesla");
    } else {
      toast.error(t("error"));
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? t("pending") : t("label")}
    </Button>
  );
}
