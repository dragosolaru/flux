import { redirect } from "next/navigation";

import { ReviewV2Client } from "./review-client";
import { auth } from "@/lib/auth";

export const metadata = { title: "Verifică documentul · Flux v2" };

export default async function ReviewV2Page({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/v2/login?callbackUrl=%2Fv2%2Fdocuments");

  const { documentId } = await params;
  return <ReviewV2Client documentId={documentId} />;
}
