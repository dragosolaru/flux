"use client";

import { cloneElement, isValidElement, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlusCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const BRANDS = [
  { value: "tesla",    label: "Tesla",         emoji: "⚡", color: "border-red-400/50 bg-red-500/10 hover:bg-red-500/20",    models: ["Model 3", "Model Y", "Model S", "Model X"] },
  { value: "bmw",      label: "BMW",           emoji: "🔵", color: "border-blue-400/50 bg-blue-500/10 hover:bg-blue-500/20",   models: ["i4 eDrive35", "i4 M50", "iX xDrive40", "iX M60"] },
  { value: "polestar", label: "Polestar",      emoji: "⭐", color: "border-yellow-400/50 bg-yellow-500/10 hover:bg-yellow-500/20", models: ["Polestar 2", "Polestar 3"] },
  { value: "mercedes", label: "Mercedes-EQ",   emoji: "💎", color: "border-slate-400/50 bg-slate-500/10 hover:bg-slate-500/20",  models: ["EQE 300", "EQE 43 AMG", "EQS 450+"] },
  { value: "vw",       label: "Volkswagen",    emoji: "🌀", color: "border-sky-400/50 bg-sky-500/10 hover:bg-sky-500/20",     models: ["ID.3", "ID.4", "ID.5", "ID.7"] },
  { value: "hyundai",  label: "Hyundai / Kia", emoji: "🔋", color: "border-indigo-400/50 bg-indigo-500/10 hover:bg-indigo-500/20", models: ["Ioniq 5", "Ioniq 6", "EV6", "EV9"] },
  { value: "renault",  label: "Renault",       emoji: "🟠", color: "border-orange-400/50 bg-orange-500/10 hover:bg-orange-500/20", models: ["Megane E-Tech", "Scenic E-Tech"] },
];

const SCENARIOS = [
  { value: "commuter",        label: "Daily Commuter",       desc: "9-to-5, home charging" },
  { value: "weekend-errands", label: "Weekend Errands",      desc: "Short city trips" },
  { value: "road-trip",       label: "Road Trip",            desc: "Long distance with DC stops" },
  { value: "vacation",        label: "Vacation",             desc: "Multi-day getaway" },
];

type Step = "brand" | "details" | "success";

interface AddVehicleModalProps {
  trigger?: React.ReactNode;
}

export function AddVehicleModal({ trigger }: AddVehicleModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("brand");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [nickname, setNickname] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [scenario, setScenario] = useState("commuter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState("");

  const router = useRouter();
  const queryClient = useQueryClient();

  const selectedBrand = BRANDS.find((b) => b.value === brand);

  function reset() {
    setStep("brand");
    setBrand("");
    setModel("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) { setError("Nickname is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
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

  const stepIndex = step === "brand" ? 0 : step === "details" ? 1 : 2;

  return (
    <>
      {triggerEl}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add vehicle"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <Card className="w-full max-w-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
            <CardHeader className="relative pb-3">
              {/* Step indicator */}
              {step !== "success" && (
                <div className="mb-3 flex items-center gap-1.5">
                  {["brand", "details"].map((s, i) => (
                    <div
                      key={s}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors",
                        i < stepIndex ? "bg-primary" : i === stepIndex ? "bg-primary" : "bg-muted",
                        i < stepIndex && "opacity-60",
                      )}
                    />
                  ))}
                </div>
              )}

              <CardTitle className="pr-8">
                {step === "brand" ? "Choose your brand" :
                 step === "details" ? `${selectedBrand?.label ?? ""} — vehicle details` :
                 "Vehicle added!"}
              </CardTitle>
              <CardDescription>
                {step === "brand" ? "Which manufacturer is your EV?" :
                 step === "details" ? "Name your car and pick a driving scenario." :
                 "Your new vehicle is ready in the garage."}
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
              {step === "brand" && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                  {BRANDS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => { setBrand(b.value); setModel(b.models[0] ?? ""); setStep("details"); }}
                      className={cn(
                        "flex flex-col items-start rounded-xl border p-4 text-left transition-all",
                        b.color,
                      )}
                    >
                      <span className="mb-1.5 text-2xl">{b.emoji}</span>
                      <span className="text-sm font-semibold leading-tight">{b.label}</span>
                      <span className="mt-0.5 text-xs text-muted-foreground">{b.models.length} models</span>
                    </button>
                  ))}
                </div>
              )}

              {step === "details" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="model">Model</Label>
                    <select
                      id="model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {selectedBrand?.models.map((m) => (
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
                      onChange={(e) => setNickname(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="year">Year</Label>
                    <select
                      id="year"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 8 }, (_, i) => 2025 - i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Driving scenario</Label>
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

                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="outline" onClick={() => setStep("brand")} className="flex-1">
                      Back
                    </Button>
                    <Button type="submit" disabled={loading} className="flex-1">
                      {loading ? "Adding…" : "Add vehicle"}
                    </Button>
                  </div>
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
                      {selectedBrand?.label} · {model} · {year}
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
