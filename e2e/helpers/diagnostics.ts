import type { Page, Response } from "@playwright/test";

/**
 * Console/pageerror collection shared by the offline public-page specs.
 *
 * Every entry we deliberately tolerate is listed in KNOWN_NOISE with the
 * reason. Anything not listed there fails the test — the point of these
 * helpers is that new console errors cannot slip into CI unnoticed.
 */

export type Diagnostics = {
  /** console.error text, minus KNOWN_NOISE. */
  errors: string[];
  /** Uncaught exceptions. Never filtered. */
  pageErrors: string[];
  /** Everything, unfiltered — for the specs that assert on known bugs. */
  all: string[];
};

/**
 * next-themes injects its pre-paint theme script WITHOUT a nonce, so the CSP
 * in src/proxy.ts ('strict-dynamic' + nonce) blocks it on every page load.
 * Tracked by the dedicated failing test in public-pages.spec.ts — filtered
 * here so it does not mask unrelated regressions.
 */
export const THEME_SCRIPT_CSP_VIOLATION = /Refused to execute inline script/i;

const KNOWN_NOISE: RegExp[] = [
  THEME_SCRIPT_CSP_VIOLATION,
  // The 404 spec navigates to a URL that is *meant* to 404; Chromium reports
  // the document response itself as a failed resource load.
  /Failed to load resource: the server responded with a status of 404/i,
];

/** React hydration failures. Dev builds spell them out; prod builds minify to
 *  error codes 418/423/425. Match both so the check survives `next build`. */
const HYDRATION = /hydrat|did not match|Minified React error #(418|423|425)\b/i;

export function collectDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = { errors: [], pageErrors: [], all: [] };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    diagnostics.all.push(text);
    if (!KNOWN_NOISE.some((pattern) => pattern.test(text))) {
      diagnostics.errors.push(text);
    }
  });

  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error.message);
    diagnostics.all.push(error.message);
  });

  return diagnostics;
}

export function hydrationIssues(diagnostics: Diagnostics): string[] {
  return diagnostics.all.filter((entry) => HYDRATION.test(entry));
}

/**
 * Navigate once and let client-side work settle. `networkidle` is unreliable
 * here — React Query and the RSC prefetches keep sockets busy — so we wait for
 * the document to load and then for React to have committed a hydration pass.
 *
 * Navigating twice to the same URL aborts the in-flight `/api/auth/session`
 * request that SessionProvider fires on mount, which surfaces as a spurious
 * "Failed to fetch ... errors.authjs.dev" console error. Always route page
 * loads through this helper rather than calling `page.goto` alongside it.
 */
export async function gotoSettled(page: Page, path: string): Promise<Response | null> {
  const response = await page.goto(path, { waitUntil: "load" });
  // next-themes applies the `dark` class only once React has hydrated, which
  // makes it a reliable "hydration finished" signal for this app.
  await page
    .waitForFunction(() => document.documentElement.classList.contains("dark"), null, {
      timeout: 10_000,
    })
    .catch(() => {
      /* Asserted explicitly by the specs that care; don't fail the helper. */
    });
  return response;
}
