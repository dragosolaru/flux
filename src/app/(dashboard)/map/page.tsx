import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { MapClient } from "./map-client";

export const metadata = { title: "Hartă · Flux" };

export default async function MapPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MapClient />;
}
