import { redirect } from "next/navigation";

import { TripV2Client } from "./trip-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Traseu · Flux v2" };

export default async function TripV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <TripV2Client />;
}
