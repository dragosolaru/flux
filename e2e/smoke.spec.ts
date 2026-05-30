import { test, expect } from "@playwright/test";

// Smoke tests that require no auth/DB — verify the app boots and the public
// surface renders. These run in CI on every push.

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button")).toBeVisible();
});

test("pricing page shows Free and Pro tiers", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("Free", { exact: false })).toBeVisible();
  await expect(page.getByText("Pro", { exact: false })).toBeVisible();
  await expect(page.getByText("€4.99")).toBeVisible();
});

test("dashboard redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
