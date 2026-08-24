import { redirect } from "next/navigation";

import { CommandsV2Client } from "./commands-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Comenzi · Flux v2" };

export default async function CommandsV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <CommandsV2Client />;
}
