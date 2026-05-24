export const LOCALES = ["ro", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ro";
export const LOCALE_COOKIE = "flux_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  ro: "Română",
  en: "English",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  ro: "🇷🇴",
  en: "🇬🇧",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}
