import { redirect } from "next/navigation";

import { MoreV2Client } from "./more-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Mai mult · Flux v2" };

export default async function MoreV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/v2/login?callbackUrl=%2Fv2%2Fmore");
  return <MoreV2Client />;
}
