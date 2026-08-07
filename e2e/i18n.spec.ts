import { test, expect } from "@playwright/test";

import { collectDiagnostics, gotoSettled } from "./helpers/diagnostics";

/**
 * Locale resolution (src/lib/i18n/request.ts) is cookie → Accept-Language →
 * DEFAULT_LOCALE, and none of it needs the network, so all five locales are
 * fully testable offline.
 *
 * Note the root playwright config pins `locale: "en"`, so every test here that
 * cares about another locale overrides it explicitly with `test.use`.
 */

const LOCALES = [
  { code: "ro", hero: "EV-ul tău. Complet în control.", notFound: "Pagina nu a fost găsită" },
  { code: "en", hero: "Your EV. Fully in focus.", notFound: "Page not found" },
  { code: "de", hero: "Dein E-Auto. Alles im Blick.", notFound: "Seite nicht gefunden" },
  { code: "fr", hero: "Votre EV. Tout sous contrôle.", notFound: "Page introuvable" },
  { code: "hu", hero: "Az autód. Mindent látod.", notFound: "Az oldal nem található" },
] as const;

/** next-intl logs this to console.error for any key missing from a locale. */
const MISSING_MESSAGE = /MISSING_MESSAGE|Could not resolve/i;

test.describe("default locale", () => {
  // Romanian is DEFAULT_LOCALE. An Accept-Language the app does not support
  // must fall through to it rather than rendering keys or crashing.
  test.use({ locale: "ja-JP" });

  test("an unsupported Accept-Language falls back to Romanian", async ({ page }) => {
    const diagnostics = collectDiagnostics(page);
    await gotoSettled(page, "/");

    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await expect(
      page.getByRole("heading", { level: 1, name: "EV-ul tău. Complet în control." }),
    ).toBeVisible();
    expect(diagnostics.errors).toEqual([]);
  });

  test("the 404 page renders in the default locale too", async ({ page }) => {
    await gotoSettled(page, "/no-such-route");
    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await expect(page.getByRole("heading", { name: "Pagina nu a fost găsită" })).toBeVisible();
  });
});

for (const locale of LOCALES) {
  test.describe(`locale ${locale.code}`, () => {
    test.use({ locale: locale.code });

    test("landing page renders translated copy with no missing messages", async ({ page }) => {
      const diagnostics = collectDiagnostics(page);
      await gotoSettled(page, "/");

      await expect(page.locator("html")).toHaveAttribute("lang", locale.code);
      await expect(page.getByRole("heading", { level: 1, name: locale.hero })).toBeVisible();

      expect(
        diagnostics.all.filter((entry) => MISSING_MESSAGE.test(entry)),
        `missing translations for ${locale.code}`,
      ).toEqual([]);
      expect(diagnostics.errors).toEqual([]);
    });

    test("404 page renders translated copy", async ({ page }) => {
      await gotoSettled(page, "/definitely-not-a-route");
      await expect(page.getByRole("heading", { name: locale.notFound })).toBeVisible();
    });
  });
}

test.describe("locale cookie", () => {
  // The cookie set by the in-app language switcher must win over the browser's
  // Accept-Language — the config-level `locale: "en"` is the header here.
  test("flux_locale cookie overrides Accept-Language", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "flux_locale", value: "de", url: baseURL! }]);
    await gotoSettled(page, "/");

    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(
      page.getByRole("heading", { level: 1, name: "Dein E-Auto. Alles im Blick." }),
    ).toBeVisible();
  });

  test("an invalid cookie value falls back instead of breaking the page", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "flux_locale", value: "klingon", url: baseURL! }]);
    const diagnostics = collectDiagnostics(page);
    await gotoSettled(page, "/");

    // isLocale() rejects it, so resolution continues to Accept-Language ("en").
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(diagnostics.errors).toEqual([]);
  });
});
