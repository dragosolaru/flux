import { redirect } from "next/navigation";

import { ChargersV2Client } from "./chargers-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Încărcătoare · Flux v2" };

export default async function ChargersV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ChargersV2Client />;
}
