import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { EnergyClient } from "./energy-client";

export const metadata = { title: "Energy · Flux" };

export default async function EnergyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <EnergyClient />;
}
