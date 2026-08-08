// HTTP/2 has no reason phrase, so `res.statusText` is "" for everything Vercel
// serves. The fallback chain used `??`, which only skips null and undefined —
// so the empty string won, and every error without a JSON body reached the UI
// as an empty message. Callers written as `msg || t("some_hint")` then showed
// their fallback hint, which is how a 504 from a planner timeout came out as
// "try a higher battery percentage".

import { describe, it, expect, vi, afterEach } from "vitest";

import { apiFetch, ApiError } from "../api-fetch";

function respond(status: number, body: unknown, statusText = "") {
  return {
    ok: false,
    status,
    statusText,
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(res: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
}

describe("apiFetch error messages", () => {
  it("never throws an empty message when HTTP/2 gives no status text", async () => {
    stub(respond(504, undefined));
    const err = (await apiFetch("/api/trip-plan").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toBe("");
    expect(err.message).toContain("504");
  });

  it("keeps the API's own message and appends the status", async () => {
    stub(respond(400, { message: "vehicle-state-unavailable" }));
    const err = (await apiFetch("/api/trip-plan").catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe("vehicle-state-unavailable (400)");
  });

  it("falls back to `result`, which is where command routes report failures", async () => {
    stub(respond(412, { result: "Tesla Vehicle Command Protocol required", code: "VCP_REQUIRED" }));
    const err = (await apiFetch("/api/vehicles/x/commands").catch((e: unknown) => e)) as ApiError;
    expect(err.message).toContain("Vehicle Command Protocol required");
    expect((err as ApiError).code).toBe("VCP_REQUIRED");
  });

  it("uses status text when there is one", async () => {
    stub(respond(500, undefined, "Internal Server Error"));
    const err = (await apiFetch("/api/trip-plan").catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe("Internal Server Error (500)");
  });

  it("carries the status so callers can branch on it", async () => {
    stub(respond(429, { message: "Too many requests" }));
    const err = (await apiFetch("/api/trip-plan").catch((e: unknown) => e)) as ApiError;
    expect((err as ApiError).status).toBe(429);
  });
});
