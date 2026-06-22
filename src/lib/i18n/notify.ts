import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

type Messages = Record<string, unknown>;

const cache = new Map<Locale, Messages>();

async function loadMessages(locale: Locale): Promise<Messages> {
  const cached = cache.get(locale);
  if (cached) return cached;
  const messages = (await import(`./locales/${locale}.json`)).default as Messages;
  cache.set(locale, messages);
  return messages;
}

function resolveKey(messages: Messages, path: string): string | undefined {
  let node: unknown = messages;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

/**
 * Resolve a notification copy key for an arbitrary locale, outside any request
 * scope (used by the cron dispatcher). Keys live under the `notifications`
 * namespace in each locale file. Falls back to the default locale on a miss.
 */
export async function translateNotification(
  rawLocale: string | null | undefined,
  key: string,
  params: Record<string, string | number> = {},
): Promise<string> {
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const fullKey = `notifications.${key}`;

  const messages = await loadMessages(locale);
  let template = resolveKey(messages, fullKey);

  if (template === undefined && locale !== DEFAULT_LOCALE) {
    template = resolveKey(await loadMessages(DEFAULT_LOCALE), fullKey);
  }

  return interpolate(template ?? fullKey, params);
}
