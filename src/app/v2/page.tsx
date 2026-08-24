import { redirect } from "next/navigation";

import { V2IndexClient } from "./index-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Flux v2" };

export default async function V2IndexPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/v2/login?callbackUrl=%2Fv2");
  return <V2IndexClient />;
}
