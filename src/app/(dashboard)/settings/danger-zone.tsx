"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function DangerZone() {
  const [pending, setPending] = useState(false);

  async function deleteAccount() {
    const confirmed = confirm(
      "Delete your Flux account permanently? This cannot be undone.",
    );
    if (!confirmed) return;

    setPending(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    setPending(false);

    if (res.ok) {
      toast.success("Account deleted");
      signOut({ callbackUrl: "/" });
    } else {
      toast.error("Could not delete account");
    }
  }

  return (
    <Button variant="destructive" onClick={deleteAccount} disabled={pending}>
      {pending ? "Deleting…" : "Delete account"}
    </Button>
  );
}
