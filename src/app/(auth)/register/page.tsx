import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Create your Flux account",
};

export default async function RegisterPage() {
  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-extralight tracking-[0.15em]">flux</h1>
          <p className="mt-1 text-[12px] text-muted-foreground/60">{t("tagline")}</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm mode="register" />
        </Suspense>
      </div>
    </div>
  );
}
