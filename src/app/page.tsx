import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Zap } from "lucide-react";

import { auth } from "@/lib/auth";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingFeatures } from "@/components/landing/LandingFeatures";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return {
    title: "Flux — EV Management for Tesla Owners",
    description: t("hero_subheadline"),
    openGraph: {
      title: "Flux — EV Management for Tesla Owners",
      description: t("hero_subheadline"),
      type: "website",
    },
  };
}

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }

  const t = await getTranslations("landing");

  const features = [
    {
      icon: "ScanLine" as const,
      title: t("feature_ocr_title"),
      desc: t("feature_ocr_desc"),
    },
    {
      icon: "BatteryCharging" as const,
      title: t("feature_tariff_title"),
      desc: t("feature_tariff_desc"),
    },
    {
      icon: "Gauge" as const,
      title: t("feature_smart_title"),
      desc: t("feature_smart_desc"),
    },
    {
      icon: "Globe" as const,
      title: t("feature_i18n_title"),
      desc: t("feature_i18n_desc"),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/8 bg-background/80 px-6 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="size-4" />
          </div>
          Flux
          <span className="text-xs font-normal text-muted-foreground">
            by DAO Lab
          </span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("hero_cta_pricing")}
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-gradient-to-r from-primary to-primary/90 px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("hero_cta")}
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero — animated client component */}
        <LandingHero
          headline={t("hero_headline")}
          subheadline={t("hero_subheadline")}
          ctaLabel={t("hero_cta")}
          ctaPricingLabel={t("hero_cta_pricing")}
          badgeLabel={t("hero_badge")}
        />

        {/* Features — animated client component */}
        <section className="border-t border-white/8 bg-white/[0.02] px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-tight sm:text-3xl">
              {t("features_title")}
            </h2>
            <LandingFeatures features={features} />
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("pricing_teaser_title")}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t("pricing_teaser_desc")}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="w-full rounded-xl bg-gradient-to-r from-primary to-primary/90 px-8 py-3 text-center text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
              >
                {t("hero_cta")}
              </Link>
              <Link
                href="/pricing"
                className="w-full rounded-xl border border-white/10 px-8 py-3 text-center text-sm font-medium transition-colors hover:bg-white/5 sm:w-auto"
              >
                {t("pricing_teaser_cta")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/8 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded bg-primary text-primary-foreground">
              <Zap className="size-3" />
            </div>
            <span>© 2026 DAO Lab</span>
          </div>
          <div className="flex gap-6">
            <Link href="/pricing" className="transition-colors hover:text-foreground">
              {t("hero_cta_pricing")}
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              {t("hero_cta")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
