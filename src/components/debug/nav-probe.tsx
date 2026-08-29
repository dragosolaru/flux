"use client";

import { useState } from "react";

import { useVehicles } from "@/hooks/useVehicles";

/**
 * Which way of sending a destination makes the car precondition?
 *
 * Flux sends bare coordinates and the car never warms its battery on the way to
 * a charger. The same station shared from Google Maps does warm it. The
 * difference is not the place — it is what the car is told about the place: two
 * numbers cannot say "this is a charger", a resolved address can, because the
 * car looks it up in its own POI database.
 *
 * That is one data point and a hypothesis. The last person here who acted on a
 * hypothesis about a Tesla command without measuring it shipped a Max Defrost
 * that fired every time a driver sent a destination. So this measures.
 *
 * Read the *car*, not this panel: what matters is whether the climate screen
 * starts preconditioning within a minute or two of a send. This only reports
 * whether Tesla accepted the command, which is the smaller half of the answer.
 */

type Method = "gps" | "share" | "navigation_request";

interface Attempt {
  method: Method;
  ok: boolean;
  detail: string;
}

const METHODS: { id: Method; label: string; note: string }[] = [
  {
    id: "gps",
    label: "1 · Coordonate",
    note: "navigation_gps_request — exact ce trimite aplicația azi. Ăsta e martorul: dacă preîncălzește și aici, ipoteza mea e greșită.",
  },
  {
    id: "share",
    label: "2 · Adresă (share)",
    note: "Formatul de share Android, cel pe care îl trimite Google Maps. Dacă doar ăsta preîncălzește, am găsit răspunsul.",
  },
  {
    id: "navigation_request",
    label: "3 · Adresă (navigation_request)",
    note: "Același corp, numele vechi al endpointului. Doar în caz că Fleet API îl acceptă pe ăsta și nu pe „share”.",
  },
];

export function NavProbe() {
  // Self-contained: /debug has no vehicle context, and a probe that needs one
  // wired through the page is a probe nobody mounts. The first linked Tesla is
  // the only car that can answer this — the simulator has no navigation.
  const { data: vehicles } = useVehicles();
  const car = vehicles?.find((v) => v.dataSource === "live" && v.brand === "tesla") ?? null;
  const vehicleId = car?.id ?? null;
  const isLive = car != null;

  // Somewhere with a charger, typed as a human would type it into the car's
  // search box — the address is the variable under test, so it is editable.
  const [address, setAddress] = useState("Renovatio e-charge, Calea Baciului, Cluj");
  const [lat, setLat] = useState("46.76913");
  const [lng, setLng] = useState("23.59095");
  const [busy, setBusy] = useState<Method | null>(null);
  const [log, setLog] = useState<Attempt[]>([]);

  const ready = vehicleId != null && isLive;

  async function send(method: Method) {
    if (!vehicleId) return;
    setBusy(method);
    try {
      const res = await fetch("/api/debug/nav-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId,
          lat: Number(lat),
          lng: Number(lng),
          address,
          method,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        command?: string;
        result?: { result?: boolean; reason?: string };
        error?: string;
        message?: string;
      };
      setLog((prev) => [
        {
          method,
          ok: data.ok === true && data.result?.result !== false,
          detail:
            data.error ??
            data.message ??
            (data.result?.reason ? `${data.command}: ${data.result.reason}` : (data.command ?? "—")),
        },
        ...prev,
      ]);
    } catch (err) {
      setLog((prev) => [
        { method, ok: false, detail: err instanceof Error ? err.message : "eșuat" },
        ...prev,
      ]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Trimite aceeași stație în trei feluri. Între apăsări, uită-te la{" "}
        <strong className="text-foreground">ecranul mașinii</strong>, nu aici: întrebarea e dacă
        pornește preîncălzirea bateriei în minutul următor. Panoul ăsta îți spune doar dacă Tesla a
        acceptat comanda, ceea ce e jumătatea mică a răspunsului.
      </p>

      {!ready && (
        <p className="rounded-lg border border-chart-3/40 bg-chart-3/10 px-3 py-2 text-xs text-chart-3">
          Cere o mașină Tesla conectată — simulatorul nu poate răspunde la asta, fiindcă tot ce
          contează e ce face navigația unei mașini reale cu destinația.
        </p>
      )}

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Adresă</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
      </label>

      <div className="flex gap-2">
        {[
          { v: lat, set: setLat, k: "Lat" },
          { v: lng, set: setLng, k: "Lng" },
        ].map(({ v, set, k }) => (
          <label key={k} className="block flex-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span>
            <input
              value={v}
              onChange={(e) => set(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        ))}
      </div>

      <div className="space-y-2">
        {METHODS.map((m) => (
          <div key={m.id} className="rounded-lg border border-border p-3">
            <button
              onClick={() => void send(m.id)}
              disabled={!ready || busy !== null}
              className="min-h-11 w-full rounded-lg border border-primary/50 bg-primary/15 px-4 font-mono text-sm disabled:opacity-40"
            >
              {busy === m.id ? "Trimit…" : m.label}
            </button>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{m.note}</p>
          </div>
        ))}
      </div>

      {log.length > 0 && (
        <div className="rounded-lg border border-border">
          {log.map((a, i) => (
            <div
              key={`${a.method}-${i}`}
              className={`flex items-baseline justify-between gap-3 px-3 py-2 ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {a.method}
              </span>
              <span
                className={`text-right font-mono text-xs ${
                  a.ok ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {a.ok ? "acceptat" : "respins"} · {a.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
