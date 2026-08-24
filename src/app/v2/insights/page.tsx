import { redirect } from "next/navigation";

import { InsightsV2Client } from "./insights-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Analize · Flux v2" };

export default async function InsightsV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <InsightsV2Client />;
}
