import { redirect } from "next/navigation";

import { EnergyV2Client } from "./energy-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Energie · Flux v2" };

export default async function EnergyV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <EnergyV2Client />;
}
