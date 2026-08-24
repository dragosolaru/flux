import { redirect } from "next/navigation";

import { DocumentsV2Client } from "./documents-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Documente · Flux v2" };

export default async function DocumentsV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <DocumentsV2Client />;
}
