// Where a command is sent, and under what name.
//
// This decision has broken twice with nothing to catch it. Commit f08b316 sent
// the numeric Fleet API id to the signing proxy, which answers
// `404 expected 17-character VIN in path` — every signed command failed before
// reaching Tesla, and it read as a pairing problem for days. Then
// `share_navigation` turned out to be routed through a proxy that has no case
// for `navigation_gps_request` and answers `400 invalid_command` locally, so
// "send to navigation" could never have worked.
//
// Both are one line of routing logic and neither had a test. This is that test:
// for every entry in TESLA_COMMAND_MAP, with and without a proxy configured,
// assert the URL, the vehicle tag and the body actually sent.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { TESLA_COMMAND_MAP } from "@/lib/brands/tesla/command-map";

const PROXY = "https://proxy.example.com";
const VIN = "5YJ3E1EA7KF000001";
const TESLA_ID = 1493228918273456;
const EU_HOST = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

vi.mock("../tokens", () => ({
  getValidAccessToken: vi.fn(async () => ({ accessToken: "tok", region: "eu" })),
  // Re-exported by api.ts, so the mock has to carry it or the import fails.
  TeslaAuthError: class TeslaAuthError extends Error {},
}));

async function send(command: keyof typeof TESLA_COMMAND_MAP, args: Record<string, unknown> | null) {
  const { sendVehicleCommand } = await import("../api");
  const entry = TESLA_COMMAND_MAP[command]!;
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ response: { result: true, reason: "" } }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await sendVehicleCommand({
    vehicleId: "veh-1",
    userId: "user-1",
    teslaVehicleId: TESLA_ID,
    vin: VIN,
    command: entry.teslaCmd,
    body: entry.buildBody(args),
    signed: entry.signed,
  });

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, body: init.body ? JSON.parse(init.body as string) : undefined };
}

describe("command routing", () => {
  const original = process.env.TESLA_PROXY_BASE_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original == null) delete process.env.TESLA_PROXY_BASE_URL;
    else process.env.TESLA_PROXY_BASE_URL = original;
    vi.unstubAllGlobals();
  });

  describe("with a signing proxy configured", () => {
    beforeEach(() => {
      process.env.TESLA_PROXY_BASE_URL = PROXY;
    });

    // Everything except the sharing commands. The proxy addresses cars by VIN
    // and refuses the numeric id outright.
    const signedCommands = (
      Object.keys(TESLA_COMMAND_MAP) as (keyof typeof TESLA_COMMAND_MAP)[]
    ).filter((c) => TESLA_COMMAND_MAP[c]?.signed !== false);

    it.each(signedCommands)("%s goes to the proxy, addressed by VIN", async (command) => {
      const { url } = await send(command, defaultArgs(command));
      expect(url).toBe(`${PROXY}/api/1/vehicles/${VIN}/command/${TESLA_COMMAND_MAP[command]!.teslaCmd}`);
    });

    it("share_navigation bypasses the proxy entirely", async () => {
      const { url } = await send("share_navigation", { destination: { lat: 44.4, lng: 26.1 } });
      // Direct, and by numeric id — the proxy would answer 400 invalid_command
      // without ever contacting Tesla.
      expect(url).toBe(`${EU_HOST}/api/1/vehicles/${TESLA_ID}/command/navigation_gps_request`);
    });

    it("refuses to send a signed command without a usable VIN", async () => {
      const { sendVehicleCommand } = await import("../api");
      vi.stubGlobal("fetch", vi.fn());
      await expect(
        sendVehicleCommand({
          vehicleId: "veh-1",
          userId: "user-1",
          teslaVehicleId: TESLA_ID,
          vin: null,
          command: "door_lock",
        }),
      ).rejects.toThrow(/PROXY_NEEDS_VIN/);
    });
  });

  describe("with no proxy configured", () => {
    beforeEach(() => {
      delete process.env.TESLA_PROXY_BASE_URL;
    });

    it.each(Object.keys(TESLA_COMMAND_MAP) as (keyof typeof TESLA_COMMAND_MAP)[])(
      "%s goes straight to Tesla, addressed by numeric id",
      async (command) => {
        const { url } = await send(command, defaultArgs(command));
        expect(url).toBe(
          `${EU_HOST}/api/1/vehicles/${TESLA_ID}/command/${TESLA_COMMAND_MAP[command]!.teslaCmd}`,
        );
      },
    );
  });

  describe("bodies", () => {
    beforeEach(() => {
      process.env.TESLA_PROXY_BASE_URL = PROXY;
    });

    it("set_charge_limit sends percent", async () => {
      expect((await send("set_charge_limit", { percent: 70 })).body).toEqual({ percent: 70 });
    });

    it("set_charge_amps sends charging_amps", async () => {
      expect((await send("set_charge_amps", { amps: 12 })).body).toEqual({ charging_amps: 12 });
    });

    it("set_climate_temp sets both seats", async () => {
      expect((await send("set_climate_temp", { temp: 22 })).body).toEqual({
        driver_temp: 22,
        passenger_temp: 22,
      });
    });

    // Tesla's proximity interlock, left for Tesla to enforce. Caller-supplied
    // coordinates are ignored on purpose: passing the car's own position made
    // the check pass unconditionally, and `args` is client-controlled.
    it("window_control never takes coordinates from the caller", async () => {
      expect((await send("close_windows", { lat: 40.7, lng: 23.65 })).body).toEqual({
        command: "close",
        lat: 0,
        lon: 0,
      });
    });

    it("window_control sends 0,0 with no args", async () => {
      expect((await send("vent_windows", null)).body).toEqual({ command: "vent", lat: 0, lon: 0 });
    });

    it("share_navigation converts lng to Tesla's lon", async () => {
      expect((await send("share_navigation", { destination: { lat: 44.4, lng: 26.1 } })).body).toEqual({
        lat: 44.4,
        lon: 26.1,
        order: 0,
      });
    });

    it("schedule_charging sends minutes past midnight", async () => {
      expect((await send("schedule_charging", { enable: true, time: 1380 })).body).toEqual({
        enable: true,
        time: 1380,
      });
    });
  });
});

/** Enough of an argument bag that buildBody produces a sendable body. */
function defaultArgs(command: keyof typeof TESLA_COMMAND_MAP): Record<string, unknown> | null {
  if (command === "share_navigation") return { destination: { lat: 44.4, lng: 26.1 } };
  return null;
}
