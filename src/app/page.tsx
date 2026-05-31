import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Zap, ScanLine, BatteryCharging, Globe, Gauge } from "lucide-react";

import { auth } from "@/lib/auth";

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
      icon: ScanLine,
      title: t("feature_ocr_title"),
      desc: t("feature_ocr_desc"),
    },
    {
      icon: BatteryCharging,
      title: t("feature_tariff_title"),
      desc: t("feature_tariff_desc"),
    },
    {
      icon: Gauge,
      title: t("feature_smart_title"),
      desc: t("feature_smart_desc"),
    },
    {
      icon: Globe,
      title: t("feature_i18n_title"),
      desc: t("feature_i18n_desc"),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
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
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("hero_cta")}
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <Zap className="size-3 text-primary" />
            Flux — EV Management
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            {t("hero_headline")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {t("hero_subheadline")}
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="w-full rounded-xl bg-primary px-8 py-3 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
            >
              {t("hero_cta")}
            </Link>
            <Link
              href="/pricing"
              className="w-full rounded-xl border px-8 py-3 text-center text-sm font-medium transition-colors hover:bg-muted sm:w-auto"
            >
              {t("hero_cta_pricing")}
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-muted/30 px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-12 text-center text-2xl font-bold tracking-tight sm:text-3xl">
              {t("features_title")}
            </h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex flex-col gap-3 rounded-2xl border bg-card p-6"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
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
                className="w-full rounded-xl bg-primary px-8 py-3 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
              >
                {t("hero_cta")}
              </Link>
              <Link
                href="/pricing"
                className="w-full rounded-xl border px-8 py-3 text-center text-sm font-medium transition-colors hover:bg-muted sm:w-auto"
              >
                {t("pricing_teaser_cta")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-8">
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
