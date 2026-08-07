import { test, expect } from "@playwright/test";

import {
  describe,
  nestedInteractives,
  undersized,
  unnamedControls,
  visibleControls,
} from "./helpers/a11y";
import { collectDiagnostics, gotoSettled, hydrationIssues } from "./helpers/diagnostics";

/**
 * Coverage for every route that renders with no network access — no Supabase,
 * no OAuth provider, no OpenChargeMap. Everything under (dashboard) calls
 * `auth()` in its layout and 307s to /login, so it cannot be reached here; see
 * trip-planner.spec.ts for what the unified planner can still assert offline.
 *
 * Runs on the `chromium` (desktop) and `mobile` (Pixel 7) projects.
 */

const PUBLIC_ROUTES = [
  { path: "/", label: "landing", heading: /Your EV\. Fully in focus\./i },
  { path: "/login", label: "login", heading: null },
  { path: "/register", label: "register", heading: null },
  { path: "/pricing", label: "pricing", heading: /One app for every electric car\./i },
  { path: "/this-route-does-not-exist", label: "404", heading: /Page not found/i },
] as const;

test.describe("public pages", () => {
  for (const route of PUBLIC_ROUTES) {
    test.describe(route.label, () => {
      test(`renders without console errors or uncaught exceptions`, async ({ page }) => {
        const diagnostics = collectDiagnostics(page);

        const response = await gotoSettled(page, route.path);
        expect(response, `no response for ${route.path}`).not.toBeNull();
        expect(response!.status()).toBe(route.label === "404" ? 404 : 200);

        // Something meaningful painted — not a blank error shell.
        await expect(page.locator("body")).toBeVisible();
        expect((await page.locator("body").innerText()).trim().length).toBeGreaterThan(20);

        expect(diagnostics.pageErrors, "uncaught exceptions").toEqual([]);
        expect(diagnostics.errors, "unexpected console errors").toEqual([]);
      });

      test("hydrates without a mismatch", async ({ page }) => {
        const diagnostics = collectDiagnostics(page);
        await gotoSettled(page, route.path);

        expect(hydrationIssues(diagnostics), "React hydration warnings").toEqual([]);

        // next-themes only adds `dark` from the client, so its presence proves
        // React actually hydrated rather than the page being static HTML.
        await expect(page.locator("html")).toHaveClass(/\bdark\b/, { timeout: 10_000 });
      });

      if (route.heading) {
        test("shows its main heading", async ({ page }) => {
          await gotoSettled(page, route.path);
          await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        });
      }

      test("every interactive control has an accessible name", async ({ page }) => {
        await gotoSettled(page, route.path);
        expect(await unnamedControls(page)).toEqual([]);
      });

      test("has no nested interactive elements", async ({ page }) => {
        await gotoSettled(page, route.path);
        expect(await nestedInteractives(page)).toEqual([]);
      });

      test("all tap targets meet the WCAG 2.5.8 minimum (24x24)", async ({ page }) => {
        await gotoSettled(page, route.path);
        const tooSmall = undersized(await visibleControls(page), 24).map(describe);
        expect(tooSmall, "controls below the 24x24 AA floor").toEqual([]);
      });
    });
  }
});

test.describe("known product bugs", () => {
  /**
   * BUG: <ThemeProvider> (src/components/providers.tsx) is rendered without a
   * `nonce`, so the inline script next-themes injects to set the theme before
   * first paint is blocked by the CSP built in src/proxy.ts. The `dark` class
   * therefore only lands after hydration, producing a flash of the light
   * palette on every cold page load in production.
   *
   * Marked `fail` so the suite stays green while the bug is open AND turns red
   * the moment it is fixed, which is the signal to delete this test.
   */
  test("theme script is not blocked by the CSP", async ({ page }) => {
    test.fail();
    const diagnostics = collectDiagnostics(page);
    await page.goto("/login", { waitUntil: "load" });
    await page.waitForTimeout(1_000);

    const blocked = diagnostics.all.filter((entry) =>
      /Refused to execute inline script/i.test(entry),
    );
    expect(blocked, "CSP blocked an inline script").toEqual([]);
  });

  /**
   * BUG: the (auth) layout renders the "Flux" wordmark as a <p>, so /login and
   * /register contain no <h1> — in fact no heading at all. Screen-reader users
   * get no document outline and heading navigation is dead on both pages.
   */
  for (const path of ["/login", "/register"]) {
    test(`${path} has a top-level heading`, async ({ page }) => {
      test.fail();
      await gotoSettled(page, path);
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }
});

test.describe("mobile tap targets", () => {
  test.skip(({ isMobile }) => !isMobile, "touch-target sizing only applies on touch viewports");

  /**
   * BUG: the button primitive is 40px tall (h-10) and the pricing toggle/FAQ
   * rows are 32px and 24px, so no primary control reaches the 44x44 touch
   * target recommended by WCAG 2.5.5 and the Apple HIG. The 24x24 AA floor is
   * enforced for real above; this documents the gap to AAA.
   */
  // Only pages that actually render <button>s — the landing page is links
  // only, so it would vacuously "pass" and defeat the test.fail marker.
  for (const path of ["/login", "/register", "/pricing"]) {
    test(`${path} buttons are at least 44x44`, async ({ page }) => {
      test.fail();
      await gotoSettled(page, path);
      const buttons = (await visibleControls(page)).filter((c) => c.tag === "button");
      expect(buttons.length, "expected this page to render buttons").toBeGreaterThan(0);

      const tooSmall = buttons.filter((c) => c.height < 44 || c.width < 44).map(describe);
      expect(tooSmall).toEqual([]);
    });
  }
});
