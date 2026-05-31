"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, X, Loader2 } from "lucide-react";

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
}

interface NominatimResult {
  name: string;
  lat: number;
  lng: number;
}

function shortName(displayName: string): string {
  return displayName.split(",")[0]?.trim() ?? displayName;
}

export function GeocodingSearch({ placeholder, value, onChange, icon }: GeocodingSearchProps) {
  const [inputValue, setInputValue] = useState(value ? shortName(value.name) : "");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync inputValue when external value changes
  useEffect(() => {
    setInputValue(value ? shortName(value.name) : "");
  }, [value]);

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

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { results: NominatimResult[] };
      setResults(data.results ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setInputValue(q);
    if (value) onChange(null); // clear selection on edit
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 500);
  }

  function handleSelect(r: NominatimResult) {
    onChange({ name: r.name, lat: r.lat, lng: r.lng });
    setInputValue(shortName(r.name));
    setResults([]);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setInputValue("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <span className="absolute left-3 text-muted-foreground">
          {icon ?? <MapPin className="size-4" />}
        </span>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border bg-background py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="absolute right-3">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : value ? (
            <button onClick={handleClear} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          ) : null}
        </span>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-background shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Locația nu a fost găsită</div>
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
