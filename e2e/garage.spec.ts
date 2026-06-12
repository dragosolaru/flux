import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

// Garage tests require a live session. All tests in this file are skipped when
// E2E_TEST_EMAIL/E2E_TEST_PASSWORD are not configured.

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe("garage — vehicle management", () => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not configured");

  test.beforeEach(async ({ page }) => {
    await loginAs(page, email!, password!);
  });

  test("garage page loads with a heading", async ({ page }) => {
    await page.goto("/garage");
    // Either the vehicles list heading or the onboarding hero heading is visible
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
  });

  test("opens the Add vehicle modal", async ({ page }) => {
    await page.goto("/garage");

    // The Add vehicle button exists as a visually-styled button with that text
    const addBtn = page.getByRole("button", { name: /add vehicle/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // Modal should appear with the title "Add a vehicle"
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /add a vehicle/i })).toBeVisible();
  });

  test("add vehicle modal has model, nickname, and submit controls", async ({ page }) => {
    await page.goto("/garage");

    const addBtn = page.getByRole("button", { name: /add vehicle/i }).first();
    await addBtn.click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel(/model/i)).toBeVisible();
    await expect(page.getByLabel(/nickname/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^add vehicle$/i })).toBeVisible();
  });

  test("can fill and submit the Add vehicle form", async ({ page }) => {
    await page.goto("/garage");

    const addBtn = page.getByRole("button", { name: /add vehicle/i }).first();
    await addBtn.click();

    await page.getByLabel(/nickname/i).fill("E2E Test Car");
    await page.getByRole("button", { name: /^add vehicle$/i }).click();

    // On success the modal shows "Vehicle added!" heading
    await expect(page.getByRole("heading", { name: /vehicle added/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
