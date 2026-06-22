"use client";
import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useVehicles } from "@/hooks/useVehicles";

interface VehicleContextValue {
  selectedVehicleId: string | undefined;
  setSelectedVehicleId: (id: string) => void;
}

const VehicleContext = createContext<VehicleContextValue | null>(null);
const STORAGE_KEY = "flux:selectedVehicleId";

function readStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function VehicleProvider({ children }: { children: ReactNode }) {
  const { data: vehicles } = useVehicles();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    if (!vehicles || vehicles.length === 0) return;
    initialized.current = true;
    const stored = readStorage();
    const valid = stored && vehicles.some((v) => v.id === stored);
    const id = valid ? stored : vehicles[0]?.id;
    if (id) queueMicrotask(() => setSelectedId(id));
  }, [vehicles]);

  function setSelectedVehicleId(id: string) {
    setSelectedId(id);
    try {
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage errors
    }
  }

  return (
    <VehicleContext.Provider value={{ selectedVehicleId: selectedId, setSelectedVehicleId }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicleContext() {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error("useVehicleContext must be used within VehicleProvider");
  return ctx;
}
