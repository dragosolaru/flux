import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FluxLogo } from "@/components/ui/FluxLogo";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("auth");

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -left-24 size-64 rounded-full bg-blue-600/8 blur-3xl" />
        <div className="absolute top-1/4 -right-24 size-64 rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      {/* Back to home */}
      <div className="relative px-6 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("back_home")}
        </Link>
      </div>

      {/* Brand */}
      <header className="relative flex flex-col items-center pb-8 pt-10">
        <Link href="/" className="flex flex-col items-center gap-3">
          <FluxLogo size={48} />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Flux</h1>
            <p className="text-sm text-muted-foreground">{t("tagline")}</p>
          </div>
        </Link>
      </header>

      <main className="relative flex flex-1 items-start justify-center px-4 pb-12">
        {children}
      </main>
    </div>
  );
}
