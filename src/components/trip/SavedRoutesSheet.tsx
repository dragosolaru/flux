"use client";

// Browsing saved routes: load, rename, delete.
//
// A component rather than a local in one page: while the planner was rendered
// from two places, anything kept beside one of them existed on one screen only.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Loader2, Pencil, Route, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useRenameSavedRoute, type SavedRoute } from "@/hooks/useSavedRoutes";
import { slideUp } from "@/lib/animations/variants";

type Translator = ReturnType<typeof useTranslations>;

interface SavedRoutesSheetProps {
  open: boolean;
  onClose: () => void;
  routes: SavedRoute[];
  onLoad: (r: SavedRoute) => void;
  onDelete: (id: string) => void;
  t: Translator;
}

export function SavedRoutesSheet({ open, onClose, routes, onLoad, onDelete, t }: SavedRoutesSheetProps) {
  const tc = useTranslations("common");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const renameRoute = useRenameSavedRoute();

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    try {
      await renameRoute.mutateAsync({ id, name: renameValue.trim() });
      setRenamingId(null);
    } catch {
      toast.error(t("saved_route_error"));
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1100] bg-black/50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed bottom-0 left-0 right-0 z-[1101] max-h-[70dvh] overflow-y-auto rounded-t-[20px] border-t border-border bg-card shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <Bookmark className="size-4 text-primary" />
                <span className="text-sm font-semibold">{t("saved_routes_title")}</span>
                {routes.length > 0 && (
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                    {routes.length}/10
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label={tc("close")}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4">
              {routes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("saved_routes_empty")}</p>
              ) : (
                <div className="space-y-2">
                  {routes.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-border bg-card/60 p-3"
                    >
                      {renamingId === r.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename(r.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            placeholder={t("saved_route_rename_placeholder")}
                            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            onClick={() => void handleRename(r.id)}
                            disabled={renameRoute.isPending || !renameValue.trim()}
                            className="flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            {renameRoute.isPending ? <Loader2 className="size-4 animate-spin" /> : t("saved_route_rename_save")}
                          </button>
                          <button
                            onClick={() => setRenamingId(null)}
                            aria-label={tc("cancel")}
                            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ) : confirmDeleteId === r.id ? (
                        <div className="flex min-h-11 items-center gap-2">
                          <p className="min-w-0 flex-1 text-sm text-foreground">
                            {t("saved_route_delete_confirm")}
                          </p>
                          <button
                            onClick={() => {
                              onDelete(r.id);
                              setConfirmDeleteId(null);
                            }}
                            className="flex min-h-11 shrink-0 items-center rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground"
                          >
                            {tc("delete")}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex min-h-11 shrink-0 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
                          >
                            {tc("cancel")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <button
                                onClick={() => {
                                  setRenamingId(r.id);
                                  setRenameValue(r.name);
                                }}
                                className="flex min-h-11 items-center gap-1.5 text-left text-sm font-medium text-foreground hover:text-primary"
                              >
                                <span className="line-clamp-1">{r.name}</span>
                                <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                              </button>
                              <p className="line-clamp-1 text-xs text-muted-foreground">
                                {r.origin_label.split(",")[0]} → {r.destination_label.split(",")[0]}
                              </p>
                            </div>
                            <button
                              onClick={() => setConfirmDeleteId(r.id)}
                              aria-label={tc("delete")}
                              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                          <button
                            onClick={() => onLoad(r)}
                            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Route className="size-3.5" />
                            {t("saved_route_load")}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
