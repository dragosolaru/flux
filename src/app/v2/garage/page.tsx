import { redirect } from "next/navigation";

import { GarageV2Client } from "./garage-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Garaj · Flux v2" };

export default async function GarageV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <GarageV2Client />;
}
