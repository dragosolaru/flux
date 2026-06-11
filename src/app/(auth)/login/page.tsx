import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Sign in · Flux",
};

export default async function LoginPage() {
  const t = await getTranslations("auth");

  return (
    <div className="w-full max-w-sm px-2">
      <div className="px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">{t("title_login")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle_login")}</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm mode="login" />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("no_account")}{" "}
          <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
            {t("create_account")}
          </Link>
        </p>
      </div>
    </div>
  );
}
