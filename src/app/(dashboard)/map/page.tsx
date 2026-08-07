import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { MapClient } from "./map-client";

export async function generateMetadata() {
  const t = await getTranslations("nav");
  return { title: `${t("map")} · Flux` };
}

export default async function MapPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MapClient />;
}
