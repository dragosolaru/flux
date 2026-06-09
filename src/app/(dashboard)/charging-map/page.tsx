import type { Viewport } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ChargingMapClient } from "./charging-map-client";

export const metadata = { title: "Charging Map · Flux" };

// Disable browser page-zoom on this full-screen map page so a pinch zooms the
// map only — page-level pinch-zoom is jarring on mobile. Scoped to this route;
// content pages keep normal zoom.
export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function ChargingMapPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ChargingMapClient />;
}
