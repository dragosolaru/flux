import { redirect } from "next/navigation";

// The dedicated station map is retired. Browsing stations is the `explore` tab
// on /map, which uses the same StationMap, the same detail sheets and the same
// GET /api/chargers.
//
// Keeping two was the same trap as the two trip planners: /trip's own comment
// records three bugs in a row from a feature landing on one screen only.
// Redirecting rather than deleting keeps existing links and bookmarks working.
export default function ChargingMapPage() {
  redirect("/map?mode=explore");
}
