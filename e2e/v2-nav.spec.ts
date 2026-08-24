import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

/**
 * The bottom nav is at the bottom, and it does not sit on top of the last row.
 *
 * This has now been wrong twice, in two different ways, and both times it was
 * reported from a phone rather than caught here:
 *
 *   1. As the last child of a flex column it only reached the bottom when the
 *      content above happened to fill the viewport, so on short screens it
 *      floated mid-page.
 *   2. Fixed to the viewport, its height and the padding reserved for it were
 *      two separate numbers. Giving the links a 44px touch target changed one
 *      and not the other, and the nav covered the last row — "Actualizări live"
 *      disappeared.
 *
 * Reasoning about the CSS is what produced both. This measures instead.
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

// Every screen with a nav, including the tall ones (Commands scrolls) and the
// short ones (Settings does not) — the two failures had opposite causes, so a
// single representative screen would have missed one of them.
const SCREENS = [
  "/v2/dashboard",
  "/v2/commands",
  "/v2/map",
  "/v2/charging",
  "/v2/costs",
  "/v2/garage",
  "/v2/documents",
  "/v2/insights",
  "/v2/energy",
  "/v2/settings",
  "/v2/more",
  "/v2",
];

test.describe("v2 bottom nav", () => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not configured");

  for (const path of SCREENS) {
    test(`${path} — nav sits at the bottom and covers nothing`, async ({ page }) => {
      await loginAs(page, email!, password!);
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const nav = page.locator("nav").last();
      await expect(nav).toBeVisible();

      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();

      const navBox = (await nav.boundingBox())!;
      // Flush with the bottom of the window, on a screen of any length.
      expect(Math.abs(navBox.y + navBox.height - viewport!.height)).toBeLessThanOrEqual(2);

      // Nothing the driver is meant to read or tap may extend underneath it.
      // Rows are the only interactive element in this design, so checking them
      // covers every control on the screen.
      const rows = page.locator("main a, a, button").filter({ hasNot: page.locator("nav") });
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        const box = await rows.nth(i).boundingBox();
        if (!box) continue;
        // Only elements currently on screen: anything below the fold is reached
        // by scrolling, and the nav sticks rather than hiding it.
        if (box.y < 0 || box.y > viewport!.height) continue;
        const overlapsNav = box.y + box.height > navBox.y + 1 && box.y < navBox.y + navBox.height;
        const insideNav = box.y >= navBox.y - 1;
        expect(overlapsNav && !insideNav, `element ${i} is under the nav`).toBe(false);
      }
    });
  }

  test("scrolling a long screen keeps the nav visible", async ({ page }) => {
    await loginAs(page, email!, password!);
    await page.goto("/v2/commands");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const nav = page.locator("nav").last();
    const navBox = (await nav.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.abs(navBox.y + navBox.height - viewport.height)).toBeLessThanOrEqual(2);
  });
});
