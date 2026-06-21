import { test, expect } from "@playwright/test";

// Smoke tests that require no auth/DB — verify the app boots and the public
// surface renders. These run in CI on every push.

test("login page renders sign-in controls", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
});

test("pricing page shows Free and Pro tiers", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Free", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
  // Pricing defaults to annual (€3.25/mo); toggling to Monthly reveals €4.99.
  await expect(page.getByText("€3.25")).toBeVisible();
  await page.getByRole("button", { name: "Monthly" }).click();
  await expect(page.getByText("€4.99")).toBeVisible();
});

test("dashboard redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
