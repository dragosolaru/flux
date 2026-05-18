import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { TripClient } from "./trip-client";

export const metadata = { title: "Trip Planner · Flux" };

export default async function TripPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <TripClient />;
}
