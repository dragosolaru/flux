// Sharing a planned route to whatever app the driver picks.
//
// Kept out of the page because the first version of this lived in one of two
// duplicated planners and so reached only one screen. The screens are now one,
// but the logic stays independently testable.

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

// Google Maps URLs documents a maximum of 9 waypoints; beyond that it drops or
// rejects them silently. A long plan is thinned by keeping the first, the last,
// and an even spread between, so the shared route still passes through the
// corridor even when the exact stop list cannot survive.
const MAX_WAYPOINTS = 9;

function thinWaypoints(stops: RoutePoint[]): RoutePoint[] {
  if (stops.length <= MAX_WAYPOINTS) return stops;
  const step = (stops.length - 1) / (MAX_WAYPOINTS - 1);
  const out: RoutePoint[] = [];
  for (let i = 0; i < MAX_WAYPOINTS; i++) out.push(stops[Math.round(i * step)]);
  return out;
}

/**
 * A Google Maps directions link carrying the charging stops as waypoints.
 *
 * Only Google Maps honours the stops. Verified against each target's documented
 * scheme: Waze cannot parse a google.com/maps URL at all and takes a single
 * destination (waze.com/ul?ll=…); Apple Maps does not claim these links and its
 * own scheme is single-destination; Tesla's share-to-vehicle resolves whatever
 * it receives down to one destination. So this is the richest link we can send,
 * not a format they all understand — the others will navigate to the
 * destination and ignore the rest.
 */
export function buildRouteShareUrl(input: ShareRouteInput): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", coord(input.origin));
  url.searchParams.set("destination", coord(input.destination));
  url.searchParams.set("travelmode", "driving");
  if (input.stops.length > 0) {
    url.searchParams.set("waypoints", thinWaypoints(input.stops).map(coord).join("|"));
  }
  // Start guidance rather than opening the preview.
  url.searchParams.set("dir_action", "navigate");
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
      // No `text`: several iOS share targets take it and drop `url`, which
      // would send the route's name instead of the route.
      await navigator.share({ title: input.title, url });
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
