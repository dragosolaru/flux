"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function DangerZone() {
  const t = useTranslations("settings.danger_zone");

  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/user/export");
      if (!res.ok) {
        toast.error(t("export_error"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "flux-data-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("export_success"));
    } catch {
      toast.error(t("export_error"));
    } finally {
      setExporting(false);
    }
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setConfirmText("");
  }

  async function handleDelete() {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/user/delete", { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("delete_error"));
        setDeleting(false);
        setDialogOpen(false);
        return;
      }
      toast.success(t("delete_success"));
      await signOut({ callbackUrl: "/" });
    } catch {
      toast.error(t("delete_error"));
      setDeleting(false);
      setDialogOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="outline"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? t("exporting") : t("export_button")}
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={deleting}>
            {deleting ? t("deleting") : t("delete_button")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 py-2">
            <label className="mb-1.5 block text-sm text-muted-foreground">
              {t("confirm_input_label")}
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={deleting}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("confirm_cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmText !== "DELETE"}
            >
              {deleting ? t("deleting") : t("confirm_delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
