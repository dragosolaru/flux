import { redirect } from "next/navigation";

// The dedicated trip screen is retired. Planning now lives as a tab on /map,
// which reached parity in 53218da..: share, save, browse saved routes, clear,
// preconditioning (manual and automatic), corridor stations and long-press area
// loading.
//
// Maintaining two planners produced three bugs in a row from a feature landing
// on one screen only — most seriously preconditioning decided from the first
// stop on one and every stop on the other. Redirecting rather than deleting
// keeps existing links and bookmarks working.
export default function TripPage() {
  redirect("/map?mode=plan");
}
