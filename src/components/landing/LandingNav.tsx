"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FluxLogo } from "@/components/ui/FluxLogo";

export function LandingNav() {
  const t = useTranslations("landing");
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <FluxLogo size={22} />
          <span className="font-bold text-white">Flux</span>
          <span className="hidden text-xs text-white/40 sm:inline">by DAO Lab</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-sm text-white/60 transition-colors hover:text-white"
          >
            {t("nav_pricing")}
          </Link>
          <Link
            href="/register"
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            {t("cta_button")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
