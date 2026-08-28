"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Does the browser we are running in know where the car is, and how often?
 *
 * This exists because the public evidence is worthless: the forum threads about
 * geolocation in Tesla's browser span a decade of firmware, contradict each
 * other, and none of them is dated close enough to trust. The car is the only
 * authority on its own browser, and the question is worth exactly one tap to
 * settle.
 *
 * It decides an architecture, not a detail. Position from the Fleet API is
 * capped at a few hundred reads per vehicle per day, which cannot carry
 * navigation. Position from the browser costs nothing and is capped by nothing.
 * If `watchPosition` delivers a fix every second or two here, turn-by-turn in
 * the browser needs no streaming server, no mTLS and no always-on host — and if
 * it does not, that whole tier is off the table for a reason we can point at.
 *
 * Laid out to be PHOTOGRAPHED rather than copied: every finding is one short
 * line at readable size, because the clipboard on a car screen is not a thing
 * anyone should be relying on.
 */

interface Fix {
  t: number;
  lat: number;
  lng: number;
  acc: number;
}

interface Result {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "muted";
}

const WATCH_MS = 20_000;

function metresBetween(a: Fix, b: Fix): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// The three codes the spec defines. The message alone is not enough: browsers
// word them differently, and "User denied Geolocation" has been reported on
// this browser without any prompt ever being shown — which is a different
// problem from a driver actually saying no.
function errorText(err: GeolocationPositionError): string {
  const name =
    err.code === 1 ? "REFUZAT (cod 1)"
    : err.code === 2 ? "INDISPONIBIL (cod 2)"
    : err.code === 3 ? "EXPIRAT (cod 3)"
    : `cod ${err.code}`;
  return err.message ? `${name} — ${err.message}` : name;
}

export function GeolocationProbe() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    // Only a cleanup: a watch left running would keep asking the car for a fix
    // after the panel is closed.
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  async function run() {
    setRunning(true);
    setResults(null);

    const out: Result[] = [];
    const ua = navigator.userAgent;
    const chromium = /Chrom(e|ium)\/(\d+)/.exec(ua)?.[2] ?? null;

    out.push({
      label: "Browser",
      // The Chromium version dates the firmware better than anything the car
      // will tell us directly, and it is the first thing worth knowing when a
      // web API behaves unexpectedly here.
      value: chromium ? `Chromium ${chromium}` : ua.slice(0, 48),
      tone: "muted",
    });
    out.push({
      label: "Context sigur",
      value: window.isSecureContext ? "da (HTTPS)" : "NU — geolocația e blocată fără HTTPS",
      tone: window.isSecureContext ? "ok" : "bad",
    });

    const hasApi = "geolocation" in navigator;
    out.push({
      label: "API geolocation",
      value: hasApi ? "există" : "LIPSEȘTE din navigator",
      tone: hasApi ? "ok" : "bad",
    });

    if (!hasApi) {
      setResults(out);
      setRunning(false);
      setPhase(null);
      return;
    }

    // Permissions is itself optional, and its absence says nothing about
    // geolocation — so a missing Permissions API is reported as unknown, not
    // as a refusal.
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        out.push({
          label: "Permisiune",
          value: status.state,
          tone: status.state === "granted" ? "ok" : status.state === "denied" ? "bad" : "warn",
        });
      } catch {
        out.push({ label: "Permisiune", value: "nu se poate interoga", tone: "muted" });
      }
    } else {
      out.push({ label: "Permisiune", value: "API-ul Permissions lipsește", tone: "muted" });
    }

    setPhase("Cer o poziție…");
    const started = Date.now();
    const first = await new Promise<GeolocationPosition | GeolocationPositionError>((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, resolve, {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      });
    });

    if ("code" in first) {
      out.push({ label: "Prima poziție", value: errorText(first), tone: "bad" });
      setResults(out);
      setRunning(false);
      setPhase(null);
      return;
    }

    out.push({
      label: "Prima poziție",
      value: `${first.coords.latitude.toFixed(5)}, ${first.coords.longitude.toFixed(5)}`,
      tone: "ok",
    });
    out.push({
      label: "Precizie",
      value: `±${Math.round(first.coords.accuracy)} m · în ${((Date.now() - started) / 1000).toFixed(1)} s`,
      // Anything worse than ~50m is a network-derived fix, not the car's GPS.
      tone: first.coords.accuracy <= 50 ? "ok" : "warn",
    });

    setPhase(`Măsor ritmul, ${WATCH_MS / 1000} s…`);
    const fixes: Fix[] = [];
    await new Promise<void>((done) => {
      watchRef.current = navigator.geolocation.watchPosition(
        (p) =>
          fixes.push({
            t: Date.now(),
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            acc: p.coords.accuracy,
          }),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 0 },
      );
      setTimeout(() => {
        if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
        done();
      }, WATCH_MS);
    });

    const gaps = fixes.slice(1).map((f, i) => f.t - fixes[i].t);
    const gap = median(gaps);
    out.push({
      label: "Ritm",
      value:
        fixes.length < 2
          ? `doar ${fixes.length} poziții în ${WATCH_MS / 1000} s`
          : `${fixes.length} poziții · una la ~${(gap! / 1000).toFixed(1)} s`,
      // Under two seconds between fixes is navigation-grade. Over five is a
      // dot that lags the road.
      tone: gap != null && gap <= 2000 ? "ok" : gap != null && gap <= 5000 ? "warn" : "bad",
    });

    if (fixes.length >= 2) {
      const moved = metresBetween(fixes[0], fixes[fixes.length - 1]);
      out.push({
        label: "Mișcare",
        // A watch that repeats one cached fix forever looks identical to a
        // working one while the car is standing still, so this only means
        // something if the car is moving — and says so.
        value: `${moved.toFixed(0)} m între prima și ultima${moved < 1 ? " (stai pe loc?)" : ""}`,
        tone: "muted",
      });
    }

    setResults(out);
    setRunning(false);
    setPhase(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Întrebarea decide dacă navigația în browser e posibilă fără server de streaming.
        Pornește-o din mașină, ideal în mers. Nu trimite nimic nicăieri — totul rămâne pe
        ecran.
      </p>

      <button
        onClick={() => void run()}
        disabled={running}
        className="min-h-12 w-full rounded-lg border border-primary/50 bg-primary/15 px-4 font-mono text-sm disabled:opacity-50"
      >
        {running ? (phase ?? "…") : "Testează GPS-ul din browser"}
      </button>

      {results && (
        <div className="rounded-lg border border-border">
          {results.map((r, i) => (
            <div
              key={r.label}
              className={`flex items-baseline justify-between gap-3 px-3 py-2.5 ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <span className="shrink-0 text-xs text-muted-foreground">{r.label}</span>
              <span
                className={`text-right font-mono text-sm ${
                  r.tone === "ok"
                    ? "text-emerald-400"
                    : r.tone === "warn"
                      ? "text-amber-400"
                      : r.tone === "bad"
                        ? "text-red-400"
                        : ""
                }`}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
