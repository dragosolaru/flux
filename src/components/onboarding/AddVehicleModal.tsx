"use client";

import { cloneElement, isValidElement, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import type { ReactElement, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, CheckCircle2, Lock, PlusCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Label } from "@/components/ui/label";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useVehicles } from "@/hooks/useVehicles";
import { cn } from "@/lib/utils";
import { decodeTeslaVin, type VinInfo } from "@/lib/brands/tesla/vin-decoder";

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
  const tScenarios = useTranslations("scenarios");
  const tc = useTranslations("common");

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  function setOpen(val: boolean) {
    if (isControlled) onOpenChange?.(val);
    else setInternalOpen(val);
  }

  const [step, setStep] = useState<Step>("details");
  const [model, setModel] = useState(TESLA_MODELS[0]!);
  const [nickname, setNickname] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [scenario, setScenario] = useState<ScenarioValue>("commuter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [vin, setVin] = useState("");
  const [vinInfo, setVinInfo] = useState<VinInfo | null>(null);

  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: capabilities } = useCapabilities();
  const { data: vehicles } = useVehicles();

  const isFreeTierBlocked =
    capabilities?.hasProSubscription === false &&
    (vehicles?.length ?? 0) >= 1;

  function reset() {
    setStep("details");
    setModel(TESLA_MODELS[0]!);
    setNickname("");
    setYear(String(new Date().getFullYear()));
    setScenario("commuter");
    setError("");
    setCreatedId("");
    setVin("");
    setVinInfo(null);
  }

  function handleVinChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setVin(raw);
    const decoded = decodeTeslaVin(raw);
    setVinInfo(decoded);
    if (decoded) {
      setModel(decoded.model);
      if (decoded.year !== null) setYear(String(decoded.year));
    }
  }

  function clearVin() {
    setVin("");
    setVinInfo(null);
    setModel(TESLA_MODELS[0]!);
    setYear(String(new Date().getFullYear()));
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const els = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
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
          <div ref={dialogRef} className="w-full max-w-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-200 max-h-[90dvh] overflow-y-auto rounded-[14px] bg-white/[0.04] px-5 py-4">
            <div className="relative pb-3">
              <div className="mb-2 flex items-center gap-2">
                <BrandLogo brand="tesla" className="size-6 text-red-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tesla</span>
              </div>

              <h2 className="pr-8 text-lg font-semibold">
                {step === "details" ? t("add_vehicle.title") : t("add_vehicle.title_success")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {step === "details"
                  ? t("add_vehicle.description")
                  : t("add_vehicle.description_success")}
              </p>

              <button
                onClick={close}
                className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                aria-label={tc("close")}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4">
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
                      className="auth-input w-full"
                    >
                      {TESLA_MODELS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="year">{t("add_vehicle.field_year")}</Label>
                    <select
                      id="year"
                      value={year}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setYear(e.target.value)}
                      className="auth-input w-full"
                    >
                      {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nickname">
                      {t("add_vehicle.field_nickname")} <span className="text-destructive">*</span>
                    </Label>
                    <input
                      id="nickname"
                      placeholder={t("add_vehicle.field_nickname_placeholder")}
                      value={nickname}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setNickname(e.target.value)}
                      autoFocus
                      maxLength={50}
                      className="auth-input w-full"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="vin">{t("add_vehicle.vin_label")}</Label>
                    <div className="relative">
                      <input
                        id="vin"
                        placeholder={t("add_vehicle.vin_placeholder")}
                        value={vin}
                        onChange={handleVinChange}
                        maxLength={17}
                        className="auth-input w-full font-mono uppercase pr-8"
                      />
                      {vin && (
                        <button
                          type="button"
                          onClick={clearVin}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={t("add_vehicle.clear_vin")}
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {vinInfo && (
                      <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle className="size-4 shrink-0" />
                        {t("add_vehicle.vin_detected", {
                          variant: `${vinInfo.model} ${vinInfo.variant}`,
                          year: vinInfo.year ?? "—",
                        })}
                      </p>
                    )}
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
                            "rounded-[10px] border p-3 text-left transition-colors",
                            scenario === sv
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:bg-muted",
                          )}
                        >
                          <div className="text-xs font-semibold">{tScenarios(`${sv}.label`)}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{tScenarios(`${sv}.desc`)}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button type="submit" disabled={loading} className="h-11 w-full rounded-[10px]">
                    {loading ? t("add_vehicle.submitting") : t("add_vehicle.submit")}
                  </Button>
                </form>
              )}

              {step === "success" && (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <CheckCircle2 className="size-8 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-semibold">{nickname}</p>
                    <p className="text-sm text-muted-foreground">
                      Tesla · {model} · {year}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tScenarios(`${scenario}.label`)}
                    </p>
                  </div>
                  <div className="flex w-full gap-2 pt-2">
                    <Button variant="outline" onClick={() => { reset(); }} className="h-10 flex-1 rounded-[10px]">
                      {t("add_vehicle.btn_add_another")}
                    </Button>
                    <Button
                      onClick={() => { close(); router.push(`/dashboard?v=${createdId}`); }}
                      className="h-11 flex-1 rounded-[10px]"
                    >
                      {t("add_vehicle.btn_view_vehicle")}
                    </Button>
                  </div>
                </div>
              )}

              {step !== "success" && (
                <Button variant="ghost" size="sm" className="mt-3 h-11 w-full rounded-[10px] text-muted-foreground" onClick={close}>
                  {tc("cancel")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
