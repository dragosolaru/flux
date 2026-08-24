"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Four labels on a hairline. Not a pill, nothing floats, no icons — at this
 * size an icon is a guess and a word is not.
 *
 * The bottom padding is env(safe-area-inset-bottom) plus 14px: the home
 * indicator swallows a bare 20px, and the nav is what it swallows.
 */
const TABS = [
  { key: "car", href: "/v2/dashboard" },
  { key: "map", href: "/v2/map" },
  { key: "charging", href: "/v2/charging" },
  { key: "more", href: "/v2/more" },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const t = useTranslations("v2.nav");

  return (
    <nav
      className="grid grid-cols-4 border-t border-border pt-3.5"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)" }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className="font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-[80ms]"
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              color: active ? "var(--primary)" : "var(--v2-faint)",
            }}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
