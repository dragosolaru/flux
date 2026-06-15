"use client";

import { Check, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferences, useUpdatePreferences } from "@/hooks/usePreferences";

interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

async function geocode(address: string): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "ro,en" },
  });
  if (!res.ok) return null;

  const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (arr.length === 0) return null;
  const first = arr[0];
  return {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
    displayName: first.display_name,
  };
}

export function HomeLocationPicker() {
  const t = useTranslations();
  const { data: prefs, isPlaceholderData } = usePreferences();
  const update = useUpdatePreferences();

  const [address, setAddress] = useState(prefs?.homeAddress ?? "");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(
    prefs?.homeLat != null && prefs?.homeLng != null,
  );

  // usePreferences serves DEFAULT_PREFS (empty) as placeholder on first render;
  // seed the inputs once the real saved prefs arrive so a stored address shows.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (isPlaceholderData || hydratedRef.current) return;
    hydratedRef.current = true;
    setAddress(prefs?.homeAddress ?? "");
    setVerified(prefs?.homeLat != null && prefs?.homeLng != null);
  }, [isPlaceholderData, prefs?.homeAddress, prefs?.homeLat, prefs?.homeLng]);

  async function onVerify() {
    if (address.trim().length < 3) return;
    setError(null);
    setVerifying(true);
    try {
      const result = await geocode(address.trim());
      if (!result) {
        setError(t("settings.home_location.error"));
        return;
      }
      await update.mutateAsync({
        homeAddress: result.displayName,
        homeLat: result.lat,
        homeLng: result.lng,
      });
      setAddress(result.displayName);
      setVerified(true);
    } catch {
      setError(t("settings.home_location.error"));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor="home-address" className="flex items-center gap-2 text-sm font-medium">
        <MapPin className="size-4" />
        {t("settings.home_location.label")}
      </label>
      <p className="text-xs text-muted-foreground">
        {t("settings.home_location.description")}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id="home-address"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setVerified(false);
          }}
          placeholder={t("settings.home_location.placeholder")}
          disabled={verifying || update.isPending}
          className="flex-1"
        />
        <Button
          type="button"
          onClick={onVerify}
          disabled={verifying || update.isPending || address.trim().length < 3}
          variant={verified ? "outline" : "default"}
        >
          {verified ? (
            <>
              <Check className="size-4" /> {t("settings.home_location.verified")}
            </>
          ) : verifying ? (
            t("settings.home_location.verifying")
          ) : (
            t("settings.home_location.verify")
          )}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {verified && prefs?.homeLat != null && prefs?.homeLng != null && (
        <p className="text-xs text-muted-foreground">
          {prefs.homeLat.toFixed(4)}, {prefs.homeLng.toFixed(4)}
        </p>
      )}
    </div>
  );
}
