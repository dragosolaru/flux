import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "../login/auth-shell";
import { LoginForm } from "@/components/auth/LoginForm";
import { auth } from "@/lib/auth";

export const metadata = { title: "Cont nou · Flux v2" };

export default async function RegisterV2Page() {
  const session = await auth();
  if (session?.user?.id) redirect("/v2/dashboard");

  const t = await getTranslations("auth");

  return (
    <AuthShell
      title={t("title_register")}
      altHref="/v2/login"
      altLabel={t("sign_in_link")}
    >
      <LoginForm mode="register" defaultCallbackUrl="/v2/dashboard" />
    </AuthShell>
  );
}
