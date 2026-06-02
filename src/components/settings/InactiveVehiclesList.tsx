"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";

interface InactiveVehicle {
  id: string;
  display_name: string;
  nickname: string | null;
  data_source: string;
}

interface InactiveVehiclesListProps {
  inactiveVehicles: InactiveVehicle[];
  hasActiveFreeSlot: boolean;
}

export function InactiveVehiclesList({
  inactiveVehicles,
  hasActiveFreeSlot,
}: InactiveVehiclesListProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingReactivate, setPendingReactivate] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (inactiveVehicles.length === 0) return null;

  async function handleReactivate(vehicleId: string) {
    setPendingReactivate(vehicleId);
    try {
      await apiFetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      });
      router.refresh();
    } catch {
      // Network error — UI unchanged; user can retry
    } finally {
      setPendingReactivate(null);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/vehicles/${pendingDelete}`, { method: "DELETE" });
      setPendingDelete(null);
      setDeleteChecked(false);
      router.refresh();
    } catch {
      // Network error — UI unchanged; user can retry
    } finally {
      setIsSubmitting(false);
    }
  }

  function openDeleteDialog(vehicleId: string) {
    setPendingDelete(vehicleId);
    setDeleteChecked(false);
  }

  function closeDeleteDialog() {
    if (!isSubmitting) {
      setPendingDelete(null);
      setDeleteChecked(false);
    }
  }

  return (
    <>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-1 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>
            {t("inactive_vehicles_title")}{" "}
            <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
              {inactiveVehicles.length}
            </span>
          </span>
          {open ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>

        {open && (
          <div className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
            {inactiveVehicles.map((v) => {
              const name = v.nickname ?? v.display_name;
              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="flex-1 truncate text-sm font-medium text-muted-foreground">
                    {name}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <div title={!hasActiveFreeSlot ? t("reactivate_blocked") : undefined}>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasActiveFreeSlot || pendingReactivate === v.id}
                        onClick={() => handleReactivate(v.id)}
                      >
                        {t("reactivate")}
                      </Button>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeleteDialog(v.id)}
                    >
                      {t("delete_permanently")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => { if (!o) closeDeleteDialog(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteChecked}
                  onChange={(e) => setDeleteChecked(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <span>{t("delete_confirm_checkbox")}</span>
              </label>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!deleteChecked || isSubmitting}
            >
              {t("delete_confirm_cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
