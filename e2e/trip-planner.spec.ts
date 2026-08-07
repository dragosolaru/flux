import { test, expect } from "@playwright/test";

import { gotoSettled } from "./helpers/diagnostics";
import { loginAs } from "./helpers/auth";

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

// ---------------------------------------------------------------------------
// Reported from the field: the same route saved twice.
//
// Two ways in, and the client guard only closed the first. `routeSaved` is set
// after the POST resolves, so two taps inside the round-trip both saw it false;
// and no client guard at all can see a retry, a second tab, or loading a saved
// route and pressing save again. Migration 040 makes (user_id, route_key)
// unique and POST upserts on it, so saving the same origin/destination twice
// refreshes one row instead of adding a second.
//
// Gated on credentials: the invariant is server-side and needs a real session.
// ---------------------------------------------------------------------------

const authedEmail = process.env.E2E_TEST_EMAIL;
const authedPassword = process.env.E2E_TEST_PASSWORD;

test.describe("saving the same route twice", () => {
  test.skip(!authedEmail || !authedPassword, "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not configured");

  const payload = {
    name: "E2E dedupe probe",
    origin_label: "Kavala",
    origin_lat: 40.9397,
    origin_lng: 24.4019,
    destination_label: "Cluj-Napoca",
    destination_lat: 46.7712,
    destination_lng: 23.6236,
    stops: [],
    plan_snapshot: {},
  };

  test("POST twice leaves one row, and the second is a refresh", async ({ page, request }) => {
    await loginAs(page, authedEmail!, authedPassword!);
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "content-type": "application/json",
    };

    const before = await request.get("/api/saved-routes", { headers });
    const beforeRows = (await before.json()) as { id: string; origin_lat: number }[];
    const probeCount = (rows: { origin_lat: number }[]) =>
      rows.filter((r) => Math.abs(r.origin_lat - payload.origin_lat) < 0.001).length;

    const first = await request.post("/api/saved-routes", { headers, data: payload });
    // 201 on a genuinely new route; 200 if a previous run left one behind.
    expect([200, 201]).toContain(first.status());

    // Jittered by ~2 m — re-geocoding the same place must not create a second
    // route, which is why the key rounds to 4 decimals.
    const second = await request.post("/api/saved-routes", {
      headers,
      data: { ...payload, origin_lat: 40.93972, stops: [{ probe: true }] },
    });
    expect(second.status(), "second save is a refresh, not a create").toBe(200);

    const after = await request.get("/api/saved-routes", { headers });
    const afterRows = (await after.json()) as { id: string; origin_lat: number }[];
    expect(probeCount(afterRows), "exactly one row for the probe route").toBe(1);
    expect(afterRows.length).toBe(beforeRows.length + (probeCount(beforeRows) === 0 ? 1 : 0));

    // Clean up so re-runs start from the same state.
    const probe = afterRows.find(
      (r) => Math.abs(r.origin_lat - payload.origin_lat) < 0.001,
    );
    if (probe) await request.delete(`/api/saved-routes/${probe.id}`, { headers });
  });
});
