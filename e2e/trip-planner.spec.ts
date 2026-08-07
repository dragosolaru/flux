import { test, expect } from "@playwright/test";

import { gotoSettled } from "./helpers/diagnostics";

/**
 * Offline coverage for the unified trip planner (fcabc98 — "/map absorbs
 * /trip").
 *
 * The planner UI itself lives under (dashboard), whose layout calls `auth()`
 * and redirects to /login, and the planner's data path needs Supabase plus
 * OpenChargeMap/geocoding. None of that is reachable without network, so what
 * is verified here is the contract *around* the planner: that the retired
 * route is still served, that both entry points gate on auth, and that every
 * planner API refuses anonymous callers. The interactive planning flow is
 * covered by trip.spec.ts, which is gated on E2E_TEST_* credentials.
 */

const PLANNER_ENTRY_POINTS = ["/trip", "/map", "/map?mode=plan"];

test.describe("planner entry points", () => {
  for (const path of PLANNER_ENTRY_POINTS) {
    test(`${path} is a live route that gates on auth`, async ({ page }) => {
      const response = await gotoSettled(page, path);

      // A 404 here would mean the redirect shim left behind by the /trip →
      // /map merge was dropped and old bookmarks are dead.
      expect(response?.status(), `${path} should not 404`).toBe(200);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    });
  }

  test("the retired /trip route is still registered, not a 404 page", async ({ page }) => {
    await gotoSettled(page, "/trip");
    // The 404 page renders this heading; landing on it would mean the shim is gone.
    await expect(page.getByRole("heading", { name: /page not found/i })).toHaveCount(0);
  });
});

test.describe("planner APIs reject anonymous callers", () => {
  // CLAUDE.md rule 1: every API route checks `session?.user?.id` first. These
  // are the routes the planner calls; none may answer without a session.
  const GET_ROUTES = [
    "/api/saved-routes",
    "/api/chargers?lat=44.43&lng=26.1",
    "/api/chargers/nearby?lat=44.43&lng=26.1",
    "/api/chargers/search?q=bucharest",
    "/api/geocode?q=bucharest",
    "/api/tariffs/prices",
  ];

  for (const route of GET_ROUTES) {
    test(`GET ${route} → 401`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status()).toBe(401);
    });
  }

  test("POST /api/trip-plan → 401", async ({ request }) => {
    const response = await request.post("/api/trip-plan", { data: {} });
    expect(response.status()).toBe(401);
  });

  test("POST /api/saved-routes → 401", async ({ request }) => {
    const response = await request.post("/api/saved-routes", { data: {} });
    expect(response.status()).toBe(401);
  });

  test("the planner APIs leak nothing in the 401 body", async ({ request }) => {
    const response = await request.get("/api/saved-routes");
    const body = await response.text();
    expect(body).not.toMatch(/supabase|service_role|eyJ[A-Za-z0-9_-]{10,}/i);
  });
});

test.describe("sign-in redirect handling", () => {
  test("a hostile callbackUrl never navigates off-origin", async ({ page, baseURL }) => {
    // LoginForm validates callbackUrl.startsWith("/") before router.replace().
    // Loading the page must not bounce the browser to the attacker's origin.
    await gotoSettled(page, "/login?callbackUrl=https://evil.example.com/pwn");
    await page.waitForTimeout(1_000);
    expect(page.url().startsWith(baseURL!)).toBe(true);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  /**
   * The (dashboard) layout carries the requested path into `?callbackUrl=`,
   * which LoginForm reads and validates. It used to redirect with a bare
   * `redirect("/login")`, dropping it — so a logged-out user opening a /trip or
   * /map?mode=plan bookmark landed on /dashboard after signing in, defeating
   * the reason commit fcabc98 kept /trip alive ("existing links and bookmarks
   * keep working").
   */
  test("a deep link into the planner survives the login redirect", async ({ page }) => {
    await gotoSettled(page, "/map?mode=plan");
    await expect(page).toHaveURL(/callbackUrl=/);
  });
});
