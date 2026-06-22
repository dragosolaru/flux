import { getTranslations } from "next-intl/server";
import { DocumentsClient } from "./documents-client";

export default async function DocumentsPage() {
  const t = await getTranslations("documents");
  return <DocumentsClient headingText={t("heading")} />;
}
