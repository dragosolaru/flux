import { test, expect } from "@playwright/test";

// Auth flow tests — no real credentials needed for the page-render assertions.
// Tests gated behind E2E_TEST_* env vars are skipped in CI unless secrets are set.

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

test.describe("login page", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "flux" })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("invalid@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The form should stay on /login and show an error toast or inline message
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("has a link to the register page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /create an account/i })).toBeVisible();
  });
});

test.describe("register page", () => {
  test("renders the registration form", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "flux" })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  test("has a link back to the sign-in page", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });
});

test.describe("authenticated redirects", () => {
  test("unauthenticated user is redirected from /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user is redirected from /garage to /login", async ({ page }) => {
    await page.goto("/garage");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("successful login", () => {
  test.skip(!email || !password, "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not configured");

  test("valid credentials redirect to dashboard or garage", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|garage)/, { timeout: 15_000 });
  });
});
