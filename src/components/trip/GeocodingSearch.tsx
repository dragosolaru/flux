"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, X, Loader2, LocateFixed } from "lucide-react";

export interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
}

interface GeocodingSearchProps {
  placeholder: string;
  value: GeoPoint | null;
  onChange: (point: GeoPoint | null) => void;
  icon?: React.ReactNode;
  locating?: boolean;
  onLocate?: () => void;
  locateTitle?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  bias?: { lat: number; lng: number } | null;
}

interface NominatimResult {
  name: string;
  lat: number;
  lng: number;
}

function shortName(displayName: string): string {
  return displayName.split(",")[0]?.trim() ?? displayName;
}

export function GeocodingSearch({ placeholder, value, onChange, icon, locating, onLocate, locateTitle, onFocus, onBlur, bias }: GeocodingSearchProps) {
  const t = useTranslations("trip");
  const [inputValue, setInputValue] = useState(value ? shortName(value.name) : "");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync inputValue when external value changes — adjust state during render
  // (React's recommended pattern over a setState-in-effect).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setInputValue(value ? shortName(value.name) : "");
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const biasLat = bias?.lat;
  const biasLng = bias?.lng;

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const biasParams =
        biasLat !== undefined && biasLng !== undefined ? `&lat=${biasLat}&lng=${biasLng}` : "";
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}${biasParams}`);
      const data = await res.json() as { results: NominatimResult[] };
      setResults(data.results ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [biasLat, biasLng]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setInputValue(q);
    if (value) onChange(null); // clear selection on edit
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 500);
  }

  function handleSelect(r: NominatimResult) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange({ name: r.name, lat: r.lat, lng: r.lng });
    setInputValue(shortName(r.name));
    setResults([]);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange(null);
    setInputValue("");
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && open && results.length > 0) {
      e.preventDefault();
      handleSelect(results[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Determine right slot content and input padding
  const hasLocateBtn = !!onLocate;
  // When locate button is present: pr-16 to make room for two icons on the right
  const inputPr = hasLocateBtn ? "pr-16" : "pr-9";

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <span className="absolute left-3 text-muted-foreground">
          {icon ?? <MapPin className="size-4" />}
        </span>
        <input
          type="text"
          inputMode="search"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
            onFocus?.();
          }}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full rounded-lg border bg-background py-2 pl-9 ${inputPr} text-base focus:outline-none focus:ring-2 focus:ring-ring`}
        />
        <span className="absolute right-3 flex items-center gap-1">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : value ? (
            <button onClick={handleClear} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          ) : null}
          {hasLocateBtn && (
            <button
              onClick={onLocate}
              title={locateTitle}
              className="text-muted-foreground hover:text-foreground"
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LocateFixed className="size-4" />
              )}
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-background shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{t("location_not_found")}</div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelect(r)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{r.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
