import { redirect } from "next/navigation";

import { SettingsV2Client } from "./settings-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Setări · Flux v2" };

export default async function SettingsV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <SettingsV2Client />;
}
