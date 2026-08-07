import { describe, it, expect } from "vitest";
import { buildRouteShareUrl } from "../share-route";

const KAVALA = { lat: 40.9397, lng: 24.4019 };
const CLUJ = { lat: 46.7712, lng: 23.6236 };

describe("buildRouteShareUrl — Google Maps URLs (api=1) scheme", () => {
  it("uses the documented directions endpoint and parameter names", () => {
    const url = new URL(buildRouteShareUrl({ origin: KAVALA, destination: CLUJ, stops: [], title: "t" }));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("40.939700,24.401900");
    expect(url.searchParams.get("destination")).toBe("46.771200,23.623600");
    expect(url.searchParams.get("travelmode")).toBe("driving");
  });

  it("percent-encodes the pipe separator as %7C — Google decodes it, so this is safe", () => {
    const raw = buildRouteShareUrl({
      origin: KAVALA,
      destination: CLUJ,
      stops: [{ lat: 42.1, lng: 24.2 }, { lat: 43.8, lng: 24.0 }],
      title: "t",
    });
    expect(raw).toContain("waypoints=42.100000%2C24.200000%7C43.800000%2C24.000000");
    expect(raw).not.toContain("|");
    // Round-trips back to the documented pipe-separated form.
    expect(new URL(raw).searchParams.get("waypoints")).toBe("42.100000,24.200000|43.800000,24.000000");
  });

  it("omits waypoints entirely when there are no stops", () => {
    expect(buildRouteShareUrl({ origin: KAVALA, destination: CLUJ, stops: [], title: "t" }))
      .not.toContain("waypoints");
  });

  it("thins to the documented 9-waypoint limit, keeping first and last", () => {
    const stops = Array.from({ length: 14 }, (_, i) => ({ lat: 41 + i * 0.4, lng: 24 }));
    const wp = new URL(buildRouteShareUrl({ origin: KAVALA, destination: CLUJ, stops, title: "t" }))
      .searchParams.get("waypoints")!
      .split("|");
    // Google Maps drops or rejects anything past 9. An evenly spread subset
    // still routes through the corridor; the endpoints matter most.
    expect(wp).toHaveLength(9);
    expect(wp[0]).toBe("41.000000,24.000000");
    expect(wp[8]).toBe("46.200000,24.000000");
  });

  it("leaves a short stop list untouched", () => {
    const stops = [
      { lat: 42, lng: 24 },
      { lat: 43, lng: 24 },
    ];
    const wp = new URL(buildRouteShareUrl({ origin: KAVALA, destination: CLUJ, stops, title: "t" }))
      .searchParams.get("waypoints")!;
    expect(wp.split("|")).toHaveLength(2);
  });

  it("BUG: no scheme is produced for Apple Maps or Waze, which cannot parse a google.com/maps URL", () => {
    const url = buildRouteShareUrl({ origin: KAVALA, destination: CLUJ, stops: [], title: "t" });
    expect(url).not.toContain("maps.apple.com");
    expect(url).not.toContain("waze.com");
    // Apple Maps would need https://maps.apple.com/?saddr=..&daddr=..&dirflg=d
    // Waze would need https://waze.com/ul?ll=<lat>,<lng>&navigate=yes
  });
});
