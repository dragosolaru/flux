import { redirect } from "next/navigation";

import { MapV2Client } from "./map-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Hartă · Flux v2" };

export default async function MapV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MapV2Client />;
}
