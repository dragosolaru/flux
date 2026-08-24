"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Four labels on a hairline. Not a pill, nothing floats, no icons — at this
 * size an icon is a guess and a word is not.
 *
 * FIXED to the viewport, not the last child of a flex column. As a flex child
 * it only reached the bottom of the screen when the content above it happened
 * to fill the height, so on every short screen — settings, garage with one car,
 * an empty documents list — it floated in the middle of the page. `Screen`
 * reserves `--v2-nav-h` at the bottom so nothing ends up underneath it.
 *
 * The gutter is repeated here because a fixed element is positioned against the
 * viewport and no longer inherits the screen's padding.
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
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-background pt-3.5"
      style={{
        paddingLeft: "var(--v2-gutter)",
        paddingRight: "var(--v2-gutter)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)",
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className="min-h-11 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-[80ms]"
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
