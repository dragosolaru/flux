import Link from "next/link";
import { Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function LandingFooter() {
  const t = await getTranslations("landing");

  return (
    <footer className="border-t border-white/[0.06] py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row md:px-8">
        <div className="flex items-center gap-2 text-sm text-white/40">
          <div className="flex size-5 items-center justify-center rounded bg-violet-600">
            <Zap className="size-3 text-white" />
          </div>
          <span>{t("footer_copy")}</span>
        </div>
        <nav className="flex gap-6">
          {[
            { label: t("nav_pricing"), href: "/pricing" },
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-white/40 transition-colors hover:text-white/70"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
