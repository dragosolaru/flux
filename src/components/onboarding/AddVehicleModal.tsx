"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BRANDS = [
  { value: "tesla",    label: "Tesla",         models: ["Model 3", "Model Y", "Model S", "Model X"] },
  { value: "bmw",      label: "BMW",           models: ["i4 eDrive35", "i4 M50", "iX xDrive40", "iX M60"] },
  { value: "polestar", label: "Polestar",      models: ["Polestar 2", "Polestar 3"] },
  { value: "mercedes", label: "Mercedes-EQ",   models: ["EQE 300", "EQE 43 AMG", "EQS 450+"] },
  { value: "vw",       label: "Volkswagen ID", models: ["ID.3", "ID.4", "ID.5", "ID.7"] },
  { value: "hyundai",  label: "Hyundai / Kia", models: ["Ioniq 5", "Ioniq 6", "EV6", "EV9"] },
  { value: "renault",  label: "Renault",       models: ["Megane E-Tech", "Scenic E-Tech"] },
];

const SCENARIOS = [
  { value: "commuter",          label: "Daily Commuter — 9-to-5, home charging" },
  { value: "weekend-errands",   label: "Weekend Errands — short city trips" },
  { value: "road-trip",         label: "Road Trip — long distance with DC stops" },
  { value: "vacation",          label: "Vacation — multi-day getaway" },
];

interface AddVehicleModalProps {
  trigger?: React.ReactNode;
}

export function AddVehicleModal({ trigger }: AddVehicleModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"brand" | "details">("brand");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [nickname, setNickname] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [scenario, setScenario] = useState("commuter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      setOpen(false);
      reset();
      router.push(`/dashboard?v=${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger ?? (
          <Button>
            <PlusCircle className="mr-2 size-4" />
            Add vehicle
          </Button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>
                {step === "brand" ? "Choose a brand" : "Vehicle details"}
              </CardTitle>
              <CardDescription>
                {step === "brand"
                  ? "Pick the brand of your mock vehicle."
                  : "Fill in details and pick a driving scenario."}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {step === "brand" ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                  {BRANDS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => { setBrand(b.value); setModel(b.models[0] ?? ""); setStep("details"); }}
                      className="rounded-lg border p-3 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              ) : (
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
                    <Label htmlFor="nickname">Nickname *</Label>
                    <Input
                      id="nickname"
                      placeholder="e.g. Black Panther"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
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

                  <div className="space-y-1.5">
                    <Label htmlFor="scenario">Driving scenario</Label>
                    <select
                      id="scenario"
                      value={scenario}
                      onChange={(e) => setScenario(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {SCENARIOS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep("brand")}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button type="submit" disabled={loading} className="flex-1">
                      {loading ? "Adding…" : "Add vehicle"}
                    </Button>
                  </div>
                </form>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full text-muted-foreground"
                onClick={() => { setOpen(false); reset(); }}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
