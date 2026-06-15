"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface UpgradeButtonProps {
  tier?: "pro" | "pro_annual";
  label?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
  className?: string;
}

export function UpgradeButton({
  tier = "pro",
  label,
  variant = "default",
  size = "default",
  className,
}: UpgradeButtonProps) {
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const resolvedLabel = label ?? tc("upgrade");

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json() as { url?: string; message?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(tc("checkout_error"));
        setLoading(false);
      }
    } catch {
      toast.error(tc("checkout_error"));
      setLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleUpgrade}
      disabled={loading}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {resolvedLabel}
    </Button>
  );
}
