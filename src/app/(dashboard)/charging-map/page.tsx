import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ChargingMapClient } from "./charging-map-client";

export const metadata = { title: "Charging Map · Flux" };

export default async function ChargingMapPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ChargingMapClient />;
}
