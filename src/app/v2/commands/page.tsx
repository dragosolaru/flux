import { redirect } from "next/navigation";

import { CommandsV2Client } from "./commands-client";
import { auth } from "@/lib/auth";
import { teslaVirtualKeyUrl } from "@/lib/tesla/constants";

export const metadata = { title: "Comenzi · Flux v2" };

export default async function CommandsV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // Per domain, not per car — but every car has to be approved separately
  // by whoever sits in it. Server-only env var, so it is passed down.
  return <CommandsV2Client virtualKeyUrl={teslaVirtualKeyUrl()} />;
}
