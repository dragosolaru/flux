import { Page } from "@playwright/test";

/**
 * Log in via the credentials form. Call before any test that requires auth.
 * Relies on E2E_TEST_EMAIL / E2E_TEST_PASSWORD being set in the environment.
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for navigation away from /login — redirect lands on /dashboard or /garage
  await page.waitForURL(/\/(dashboard|garage)/, { timeout: 15_000 });
}
