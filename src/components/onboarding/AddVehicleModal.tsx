"use client";

import { cloneElement, isValidElement, useEffect, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import type { ReactElement, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlusCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TESLA_MODELS = ["Model 3", "Model Y", "Model S", "Model X"];

const SCENARIOS = [
  { value: "commuter",        label: "Daily Commuter",       desc: "9-to-5, home charging" },
  { value: "weekend-errands", label: "Weekend Errands",      desc: "Short city trips" },
  { value: "road-trip",       label: "Road Trip",            desc: "Long distance with DC stops" },
  { value: "vacation",        label: "Vacation",             desc: "Multi-day getaway" },
];

type Step = "details" | "success";

interface AddVehicleModalProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddVehicleModal({ trigger, open: controlledOpen, onOpenChange }: AddVehicleModalProps) {
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
  const [scenario, setScenario] = useState("commuter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState("");

  const router = useRouter();
  const queryClient = useQueryClient();

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
    if (!nickname.trim()) { setError("Nickname is required"); return; }
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
        Add vehicle
      </Button>
    );

  return (
    <>
      {triggerEl}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add vehicle"
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
                {step === "details" ? "Add your Tesla" : "Vehicle added!"}
              </CardTitle>
              <CardDescription>
                {step === "details"
                  ? "Pick model & nickname. Live integration requires Tesla account pairing (next step)."
                  : "Your new vehicle is ready in the garage."}
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
              {step === "details" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="model">Model</Label>
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
                      Nickname <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="nickname"
                      placeholder="e.g. Black Panther"
                      value={nickname}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setNickname(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="year">Year</Label>
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
                    <Label>Driving scenario (mock data)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {SCENARIOS.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setScenario(s.value)}
                          className={cn(
                            "rounded-lg border p-3 text-left transition-colors",
                            scenario === s.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:bg-muted",
                          )}
                        >
                          <div className="text-xs font-semibold">{s.label}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{s.desc}</div>
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
                    {loading ? "Adding…" : "Add vehicle"}
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
                      Scenario: {SCENARIOS.find((s) => s.value === scenario)?.label}
                    </p>
                  </div>
                  <div className="flex w-full gap-2 pt-2">
                    <Button variant="outline" onClick={() => { reset(); }} className="flex-1">
                      Add another
                    </Button>
                    <Button
                      onClick={() => { close(); router.push(`/dashboard?v=${createdId}`); }}
                      className="flex-1"
                    >
                      View vehicle
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
