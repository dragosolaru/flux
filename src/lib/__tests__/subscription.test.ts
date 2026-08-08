// "Is this user pro" had two answers. getSubscriptionTier honoured the
// ADMIN_EMAILS override; /api/me/capabilities read profiles.subscription_tier
// straight from the table and did not. So the same account was pro for the
// vehicle cap and free for every capability the UI renders from.
//
// These pin the one remaining answer.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = {
  tier: null as string | null,
  email: null as string | null,
  getUserByIdCalls: 0,
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { subscription_tier: state.tier } }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async () => {
          state.getUserByIdCalls++;
          return { data: { user: state.email ? { email: state.email } : null } };
        },
      },
    },
  }),
}));

const USER = "11111111-1111-1111-1111-111111111111";

describe("getSubscriptionTier", () => {
  beforeEach(() => {
    state.tier = null;
    state.email = null;
    state.getUserByIdCalls = 0;
    delete process.env.ADMIN_EMAILS;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("returns the stored tier when one is set", async () => {
    state.tier = "pro";
    const { getSubscriptionTier } = await import("../subscription");
    await expect(getSubscriptionTier(USER)).resolves.toBe("pro");
  });

  it("is free with no row and no allowlist", async () => {
    const { getSubscriptionTier } = await import("../subscription");
    await expect(getSubscriptionTier(USER)).resolves.toBe("free");
  });

  it("treats an allowlisted account as pro", async () => {
    // The maintainer needs a mock vehicle to develop against plus a real linked
    // car, and paying themselves through Stripe for the second slot is silly.
    process.env.ADMIN_EMAILS = "owner@example.com";
    state.email = "owner@example.com";
    const { getSubscriptionTier } = await import("../subscription");
    await expect(getSubscriptionTier(USER)).resolves.toBe("pro");
  });

  it("matches the allowlist case-insensitively and ignores spacing", async () => {
    process.env.ADMIN_EMAILS = " Other@example.com , OWNER@Example.COM ";
    state.email = "owner@example.com";
    const { getSubscriptionTier } = await import("../subscription");
    await expect(getSubscriptionTier(USER)).resolves.toBe("pro");
  });

  it("leaves an account off the allowlist alone", async () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    state.email = "someone.else@example.com";
    const { getSubscriptionTier } = await import("../subscription");
    await expect(getSubscriptionTier(USER)).resolves.toBe("free");
  });

  it("does not look up the email when the allowlist is empty", async () => {
    // Every limit check would otherwise pay for an auth round-trip that can
    // only ever answer "no".
    process.env.ADMIN_EMAILS = "";
    const { getSubscriptionTier } = await import("../subscription");
    await expect(getSubscriptionTier(USER)).resolves.toBe("free");
    expect(state.getUserByIdCalls).toBe(0);
  });

  it("does not look up the email when the stored tier is already pro", async () => {
    state.tier = "pro";
    process.env.ADMIN_EMAILS = "owner@example.com";
    const { getSubscriptionTier } = await import("../subscription");
    await expect(getSubscriptionTier(USER)).resolves.toBe("pro");
    expect(state.getUserByIdCalls).toBe(0);
  });
});
