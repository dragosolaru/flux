import type { ReactNode } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("auth");

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Electric glow background effect */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -left-24 size-64 rounded-full bg-blue-600/8 blur-3xl" />
        <div className="absolute top-1/4 -right-24 size-64 rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      {/* Brand header */}
      <header className="relative flex flex-col items-center pt-16 pb-8">
        <Link href="/" className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <Zap className="size-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight">Flux</p>
            <p className="text-sm text-muted-foreground">{t("tagline")}</p>
          </div>
        </Link>
      </header>

      {/* Form area */}
      <main className="relative flex flex-1 items-start justify-center px-4 pb-10">
        {children}
      </main>
    </div>
  );
}
