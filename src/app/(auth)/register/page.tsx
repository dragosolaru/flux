import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Create your Flux account",
};

export default async function RegisterPage() {
  const t = await getTranslations("auth");

  return (
    <div className="w-full max-w-sm px-2">
      <div className="px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">{t("title_register")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle_register")}</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm mode="register" />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("have_account")}{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            {t("sign_in_link")}
          </Link>
        </p>
      </div>
    </div>
  );
}
