// Sharing a planned route to whatever app the driver picks.
//
// Lives here rather than in a page because the trip planner exists twice — the
// dedicated /trip screen and the Plan tab on /map — and the first version of
// this only reached one of them.

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface ShareRouteInput {
  origin: RoutePoint;
  destination: RoutePoint;
  /** Charging stops, in order, carried as waypoints. */
  stops: RoutePoint[];
  /** Human label for the share sheet, e.g. "Kavala → Cluj". */
  title: string;
}

export type ShareRouteOutcome = "shared" | "copied" | "dismissed" | "failed";

function coord(p: RoutePoint): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/**
 * A Google Maps directions link carrying every stop as a waypoint — the one
 * route format the Tesla app and other navigation apps accept from a share.
 */
export function buildRouteShareUrl(input: ShareRouteInput): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", coord(input.origin));
  url.searchParams.set("destination", coord(input.destination));
  url.searchParams.set("travelmode", "driving");
  if (input.stops.length > 0) {
    url.searchParams.set("waypoints", input.stops.map(coord).join("|"));
  }
  return url.toString();
}

/**
 * Hand the route to the OS share sheet, falling back to the clipboard.
 *
 * Returns the outcome rather than toasting, so each caller phrases it in its
 * own copy. A dismissed sheet is reported as "dismissed", not a failure — the
 * driver closing the sheet is not an error.
 */
export async function shareRoute(input: ShareRouteInput): Promise<ShareRouteOutcome> {
  const url = buildRouteShareUrl(input);

  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: input.title, text: input.title, url });
      return "shared";
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "dismissed";
    // Anything else falls through to the clipboard.
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
