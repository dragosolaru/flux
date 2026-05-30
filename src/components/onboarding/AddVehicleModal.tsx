"use client";

import { cloneElement, isValidElement, useEffect, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import type { ReactElement, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Lock, PlusCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useVehicles } from "@/hooks/useVehicles";
import { cn } from "@/lib/utils";

const TESLA_MODELS = ["Model 3", "Model Y", "Model S", "Model X"];
const SCENARIO_VALUES = ["commuter", "weekend-errands", "road-trip", "vacation"] as const;
type ScenarioValue = typeof SCENARIO_VALUES[number];

type Step = "details" | "success";

interface AddVehicleModalProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddVehicleModal({ trigger, open: controlledOpen, onOpenChange }: AddVehicleModalProps) {
  const t = useTranslations("onboarding");

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  function setOpen(val: boolean) {
    if (isControlled) onOpenChange?.(val);
    else setInternalOpen(val);
  }

  const [step, setStep] = useState<Step>("details");
  const [model, setModel] = useState(TESLA_MODELS[0]);
  const [nickname, setNickname] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [scenario, setScenario] = useState<ScenarioValue>("commuter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState("");

  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: capabilities } = useCapabilities();
  const { data: vehicles } = useVehicles();

  const isFreeTierBlocked =
    capabilities?.hasProSubscription === false &&
    (vehicles?.length ?? 0) >= 1;

  function reset() {
    setStep("details");
    setModel(TESLA_MODELS[0]);
    setNickname("");
    setYear(String(new Date().getFullYear()));
    setScenario("commuter");
    setError("");
    setCreatedId("");
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) { setError(t("add_vehicle.error_nickname_required")); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: "tesla",
          nickname: nickname.trim(),
          model: model || undefined,
          year: parseInt(year) || undefined,
          scenarioId: scenario,
        }),
      });
      const data = await res.json() as { id?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to add vehicle");
      await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setCreatedId(data.id ?? "");
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerEl = trigger && isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<{ onClick?: () => void }>, { onClick: () => setOpen(true) })
    : (
      <Button onClick={() => setOpen(true)}>
        <PlusCircle className="mr-2 size-4" />
        {t("add_vehicle.submit")}
      </Button>
    );

  return (
    <>
      {triggerEl}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("add_vehicle.title")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) close(); }}
        >
          <Card className="w-full max-w-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
            <CardHeader className="relative pb-3">
              <div className="mb-2 flex items-center gap-2">
                <BrandLogo brand="tesla" className="size-6 text-red-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tesla</span>
              </div>

              <CardTitle className="pr-8">
                {step === "details" ? t("add_vehicle.title") : t("add_vehicle.title_success")}
              </CardTitle>
              <CardDescription>
                {step === "details"
                  ? t("add_vehicle.description")
                  : t("add_vehicle.description_success")}
              </CardDescription>

              <button
                onClick={close}
                className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </CardHeader>

            <CardContent>
              {step === "details" && isFreeTierBlocked && (
                <div className="flex flex-col items-center gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 text-center">
                  <Lock className="size-8 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold">{t("add_vehicle.upgrade_title")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("add_vehicle.upgrade_description")}</p>
                  </div>
                  <UpgradeButton label={t("add_vehicle.upgrade_cta")} className="w-full" />
                </div>
              )}

              {step === "details" && !isFreeTierBlocked && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="model">{t("add_vehicle.field_model")}</Label>
                    <select
                      id="model"
                      value={model}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setModel(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {TESLA_MODELS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nickname">
                      {t("add_vehicle.field_nickname")} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="nickname"
                      placeholder={t("add_vehicle.field_nickname_placeholder")}
                      value={nickname}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setNickname(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="year">{t("add_vehicle.field_year")}</Label>
                    <select
                      id="year"
                      value={year}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setYear(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 8 }, (_, i) => 2025 - i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("add_vehicle.field_scenario")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {SCENARIO_VALUES.map((sv) => (
                        <button
                          key={sv}
                          type="button"
                          onClick={() => setScenario(sv)}
                          className={cn(
                            "rounded-lg border p-3 text-left transition-colors",
                            scenario === sv
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:bg-muted",
                          )}
                        >
                          <div className="text-xs font-semibold">{t(`scenarios.${sv}.label`)}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{t(`scenarios.${sv}.desc`)}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? t("add_vehicle.submitting") : t("add_vehicle.submit")}
                  </Button>
                </form>
              )}

              {step === "success" && (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-chart-2/20">
                    <CheckCircle2 className="size-8 text-chart-2" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{nickname}</p>
                    <p className="text-sm text-muted-foreground">
                      Tesla · {model} · {year}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`scenarios.${scenario}.label`)}
                    </p>
                  </div>
                  <div className="flex w-full gap-2 pt-2">
                    <Button variant="outline" onClick={() => { reset(); }} className="flex-1">
                      {t("add_vehicle.btn_add_another")}
                    </Button>
                    <Button
                      onClick={() => { close(); router.push(`/dashboard?v=${createdId}`); }}
                      className="flex-1"
                    >
                      {t("add_vehicle.btn_view_vehicle")}
                    </Button>
                  </div>
                </div>
              )}

              {step !== "success" && (
                <Button variant="ghost" size="sm" className="mt-3 w-full text-muted-foreground" onClick={close}>
                  Cancel
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
