"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
  label = "Upgrade to Pro",
  variant = "default",
  size = "default",
  className,
}: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false);

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
        console.error("[UpgradeButton]", data.message);
        setLoading(false);
      }
    } catch {
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
      {label}
    </Button>
  );
}
