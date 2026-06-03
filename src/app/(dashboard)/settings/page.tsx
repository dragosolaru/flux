import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

export const metadata = {
  title: "Settings · Flux",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <SettingsClient
      userId={session.user.id}
      userName={session.user.name ?? null}
      userEmail={session.user.email ?? null}
    />
  );
}
