"use client";

import { useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferences, useUpdatePreferences } from "@/hooks/usePreferences";

const E164 = /^\+[1-9]\d{6,14}$/;

export function WhatsAppPhonePicker() {
  const t = useTranslations("settings.whatsapp");
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const current = value ?? prefs?.whatsappPhone ?? "";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = current.trim();
    if (trimmed && !E164.test(trimmed)) {
      setError(true);
      return;
    }
    setError(false);
    update.mutate({ whatsappPhone: trimmed === "" ? null : trimmed });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="whatsapp-phone" className="text-sm font-medium">
        {t("label")}
      </label>
      <p className="text-xs text-muted-foreground">{t("description")}</p>
      <div className="flex max-w-xs gap-2">
        <Input
          id="whatsapp-phone"
          type="tel"
          inputMode="tel"
          placeholder="+40712345678"
          value={current}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          aria-invalid={error}
          className="text-sm"
        />
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : update.isSuccess && value === null ? (
            <Check className="size-4" />
          ) : (
            t("save")
          )}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{t("invalid")}</p>}
    </form>
  );
}
