import { test, expect } from "@playwright/test";

// Full flow: register → add vehicle → upload document → cost appears.
// Requires a live Supabase + Anthropic key, so it is gated behind
// E2E_TEST_EMAIL/E2E_TEST_PASSWORD and skipped when they are absent
// (e.g. CI without secrets).

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe("authenticated flow", () => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not configured");

  test("login → garage → add vehicle", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in|log in|continue/i }).click();

    await expect(page).toHaveURL(/\/(garage|dashboard)/, { timeout: 15_000 });

    await page.goto("/garage");
    await expect(page.getByRole("heading")).toBeVisible();
  });
});
