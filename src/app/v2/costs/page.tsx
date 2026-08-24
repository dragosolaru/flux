import { redirect } from "next/navigation";

import { CostsV2Client } from "./costs-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Costuri · Flux v2" };

export default async function CostsV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <CostsV2Client />;
}
