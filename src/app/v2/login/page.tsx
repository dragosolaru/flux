import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "./auth-shell";
import { LoginForm } from "@/components/auth/LoginForm";
import { auth } from "@/lib/auth";

export const metadata = { title: "Autentificare · Flux v2" };

export default async function LoginV2Page() {
  const session = await auth();
  if (session?.user?.id) redirect("/v2/dashboard");

  const t = await getTranslations("auth");

  return (
    <AuthShell
      title={t("title_login")}
      altHref="/v2/register"
      altLabel={t("create_account")}
    >
      <LoginForm mode="login" defaultCallbackUrl="/v2/dashboard" />
    </AuthShell>
  );
}
