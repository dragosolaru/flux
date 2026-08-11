// Which failure is it, and does the driver get told the right thing.
//
// Three refusals arrive as HTTP errors from Tesla or from the signing proxy,
// they need three different fixes, and two of them share a status code:
//
//   401                              → the grant is gone. Re-authorise.
//   403 + "Protocol required"        → nothing signed it. Deploy the proxy.
//   403 + scope text                 → the grant never carried the scope.
//   500 + "has not been paired"      → signed, car refused. Pair the key.
//
// Classifying 403 by status alone collapsed the second into the first, and it
// did so invisibly: commands/route.ts checks `instanceof TeslaAuthError` before
// it string-matches, so the VCP branch became unreachable and an operator who
// had simply not deployed the proxy was told to re-authorise Tesla.
//
// This asserts the classification AND the branch order the route applies to it,
// because the bug lived in the interaction between the two.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { TeslaAuthError } from "../tokens";

vi.mock("../tokens", async () => {
  class TeslaAuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "TeslaAuthError";
    }
  }
  return {
    getValidAccessToken: vi.fn(async () => ({ accessToken: "tok", region: "eu" })),
    TeslaAuthError,
  };
});

/**
 * The catch block of src/app/api/vehicles/[vehicleId]/commands/route.ts,
 * reduced to the decision it makes. Kept in step with that file deliberately:
 * the defect was the ORDER of these checks, which no test of the thrown error
 * alone can see.
 */
function classify(err: unknown, proxyConfigured: boolean) {
  const msg = err instanceof Error ? err.message : "Command failed";
  if (err instanceof TeslaAuthError) return { status: 409, code: "TESLA_REAUTH_REQUIRED" };
  if (msg.startsWith("PROXY_UNREACHABLE:")) return { status: 502, code: "PROXY_UNREACHABLE" };
  const notPaired = /has not been paired with the vehicle/i.test(msg);
  const unsigned = msg.includes("Vehicle Command Protocol required");
  if (notPaired || unsigned) {
    return {
      status: 412,
      code: notPaired || proxyConfigured ? "VCP_REQUIRED" : "PROXY_NOT_CONFIGURED",
    };
  }
  return { status: 502, code: "COMMAND_FAILED" };
}

async function sendAgainst(status: number, body: string) {
  const { sendVehicleCommand } = await import("../api");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
  try {
    await sendVehicleCommand({
      vehicleId: "veh-1",
      userId: "user-1",
      teslaVehicleId: 123,
      vin: "5YJ3E1EA7KF000001",
      command: "door_lock",
    });
    return null;
  } catch (err) {
    return err;
  }
}

describe("command error classification", () => {
  const original = process.env.TESLA_PROXY_BASE_URL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.TESLA_PROXY_BASE_URL;
  });

  afterEach(() => {
    if (original == null) delete process.env.TESLA_PROXY_BASE_URL;
    else process.env.TESLA_PROXY_BASE_URL = original;
    vi.unstubAllGlobals();
  });

  it("401 is a revoked grant", async () => {
    const err = await sendAgainst(401, '{"error":"token expired"}');
    expect(err).toBeInstanceOf(TeslaAuthError);
    expect(classify(err, false)).toEqual({ status: 409, code: "TESLA_REAUTH_REQUIRED" });
  });

  // The regression. Tesla answers 403 for this, so a status-only rule sent the
  // operator to re-consent instead of deploying the proxy.
  it("403 Vehicle Command Protocol required is NOT an auth error", async () => {
    const err = await sendAgainst(
      403,
      '{"response":null,"error":"Tesla Vehicle Command Protocol required, please refer to the documentation"}',
    );
    expect(err).not.toBeInstanceOf(TeslaAuthError);
    expect(classify(err, false)).toEqual({ status: 412, code: "PROXY_NOT_CONFIGURED" });
  });

  it("403 with the proxy deployed points at pairing, not at the operator", async () => {
    process.env.TESLA_PROXY_BASE_URL = "https://proxy.example.com";
    const err = await sendAgainst(
      403,
      '{"response":null,"error":"Tesla Vehicle Command Protocol required"}',
    );
    expect(classify(err, true)).toEqual({ status: 412, code: "VCP_REQUIRED" });
  });

  it("403 for a missing scope is still an auth error", async () => {
    const err = await sendAgainst(403, '{"error":"insufficient scope: vehicle_cmds"}');
    expect(err).toBeInstanceOf(TeslaAuthError);
    expect(classify(err, false)).toEqual({ status: 409, code: "TESLA_REAUTH_REQUIRED" });
  });

  it("the proxy's key-not-paired refusal reaches the pairing branch", async () => {
    const err = await sendAgainst(
      500,
      '{"response":null,"error":"vehicle rejected request: your public key has not been paired with the vehicle"}',
    );
    expect(err).not.toBeInstanceOf(TeslaAuthError);
    expect(classify(err, true)).toEqual({ status: 412, code: "VCP_REQUIRED" });
  });

  it("an unreachable proxy is an operator problem, not a car problem", async () => {
    process.env.TESLA_PROXY_BASE_URL = "https://proxy.example.com";
    const { sendVehicleCommand } = await import("../api");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const err = await sendVehicleCommand({
      vehicleId: "veh-1",
      userId: "user-1",
      teslaVehicleId: 123,
      vin: "5YJ3E1EA7KF000001",
      command: "door_lock",
    }).catch((e: unknown) => e);
    expect(classify(err, true)).toEqual({ status: 502, code: "PROXY_UNREACHABLE" });
  });
});
