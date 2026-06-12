import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

// Costs page tests. These require a live session with at least one vehicle.
// All tests are skipped when E2E_TEST_EMAIL/E2E_TEST_PASSWORD are not configured.

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe("costs page", () => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not configured");

  test.beforeEach(async ({ page }) => {
    await loginAs(page, email!, password!);
  });

  test("loads without errors and shows the page title", async ({ page }) => {
    // /costs auto-redirects to /costs?v=<firstVehicleId> or /garage when no vehicle exists
    await page.goto("/costs");

    // If no vehicle exists we land on /garage — still a successful load
    const url = page.url();
    if (url.includes("/garage")) {
      await expect(page.getByRole("heading").first()).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(/\/costs/);
    await expect(page.getByRole("heading", { name: /costs/i })).toBeVisible({ timeout: 10_000 });
  });

  test("shows KPI chips when a vehicle with data exists", async ({ page }) => {
    await page.goto("/costs");

    const url = page.url();
    if (url.includes("/garage")) {
      test.skip();
      return;
    }

    // KPI chips are min-w-[120px] cards — verify at least one is rendered
    // They contain a numeric value followed by a short label
    await expect(
      page.locator(".glass-card").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("document upload area is accessible via FAB", async ({ page }) => {
    await page.goto("/costs");

    const url = page.url();
    if (url.includes("/garage")) {
      test.skip();
      return;
    }

    // The floating action button (FAB) with aria-label "Add document" should be present
    const fab = page.getByRole("button", { name: /add document/i });
    await expect(fab).toBeVisible({ timeout: 10_000 });
  });

  test("export CSV link is present", async ({ page }) => {
    await page.goto("/costs");

    const url = page.url();
    if (url.includes("/garage")) {
      test.skip();
      return;
    }

    await expect(page.getByRole("link", { name: /export csv/i })).toBeVisible({ timeout: 10_000 });
  });
});
