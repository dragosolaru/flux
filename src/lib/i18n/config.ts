export const LOCALES = ["ro", "en", "de", "hu", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ro";
export const LOCALE_COOKIE = "flux_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  ro: "Română",
  en: "English",
  de: "Deutsch",
  hu: "Magyar",
  fr: "Français",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  ro: "🇷🇴",
  en: "🇬🇧",
  de: "🇩🇪",
  hu: "🇭🇺",
  fr: "🇫🇷",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}
