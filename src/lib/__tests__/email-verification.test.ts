// The token that decides whether an email address counts as identity.
//
// It gates /api/documents/recover, which hands over inbound documents. The
// failure that matters is not "an invalid token is accepted" but the quieter
// ones: a token issued for one address marking a different one verified, and a
// token that outlives its expiry.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createVerificationToken, readVerificationToken } from "../email-verification";

const USER = "11111111-2222-3333-4444-555555555555";
const EMAIL = "owner@example.com";

describe("email verification tokens", () => {
  const original = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret-value";
    vi.useRealTimers();
  });

  afterEach(() => {
    if (original == null) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = original;
    vi.useRealTimers();
  });

  it("round-trips the user and the address", () => {
    const token = createVerificationToken(USER, EMAIL);
    expect(readVerificationToken(token)).toEqual({ userId: USER, email: EMAIL });
  });

  it("normalises the address, so case cannot produce two identities", () => {
    const token = createVerificationToken(USER, "Owner@Example.COM");
    expect(readVerificationToken(token)?.email).toBe(EMAIL);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createVerificationToken(USER, EMAIL);
    process.env.NEXTAUTH_SECRET = "a-different-secret";
    expect(readVerificationToken(token)).toBeNull();
  });

  // The payload is base64url and readable — the signature is what stops an
  // attacker swapping the address for their own.
  it("rejects a token whose payload was edited", () => {
    const token = createVerificationToken(USER, EMAIL);
    const [payload, sig] = token.split(".");
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const tampered = Buffer.from(
      decoded.replace(EMAIL, "attacker@example.com"),
      "utf8",
    ).toString("base64url");
    expect(readVerificationToken(`${tampered}.${sig}`)).toBeNull();
  });

  it("expires", () => {
    const token = createVerificationToken(USER, EMAIL);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000));
    expect(readVerificationToken(token)).toBeNull();
  });

  it.each(["", "nonsense", "a.b.c", "onlyonepart", "!!!.!!!"])(
    "rejects malformed input %s",
    (bad) => {
      expect(readVerificationToken(bad)).toBeNull();
    },
  );

  it("survives an address containing a colon-adjacent local part", () => {
    const odd = "a+tag.name@example.co.uk";
    const token = createVerificationToken(USER, odd);
    expect(readVerificationToken(token)).toEqual({ userId: USER, email: odd });
  });
});
