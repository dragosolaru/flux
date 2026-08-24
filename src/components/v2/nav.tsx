"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Four labels on a hairline. Not a pill, nothing floats, no icons — at this
 * size an icon is a guess and a word is not.
 *
 * `sticky` + `mt-auto`, deliberately, rather than `fixed`:
 *
 *   · `mt-auto` pushes it to the bottom when the content above is short, which
 *     a plain flex child does not do — that is why it floated mid-page on
 *     settings and on a one-car garage.
 *   · `sticky bottom-0` keeps it against the viewport while long content
 *     scrolls underneath.
 *   · Being IN FLOW is the point. A `fixed` nav is out of flow, so the screen
 *     has to reserve its height as a separate constant — and the moment the
 *     nav's own padding changed, the two numbers disagreed and it covered the
 *     last row. Sticky occupies the space it needs, so there is no second
 *     number to keep in step.
 *
 * It bleeds past the screen gutter and re-applies it inside, so content
 * scrolling underneath cannot show through at the edges — the map is
 * full-bleed and would otherwise appear in two slivers beside the labels.
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
      className="sticky bottom-0 z-40 mt-auto grid grid-cols-4 border-t border-border bg-background"
      style={{
        marginLeft: "calc(var(--v2-gutter) * -1)",
        marginRight: "calc(var(--v2-gutter) * -1)",
        paddingLeft: "var(--v2-gutter)",
        paddingRight: "var(--v2-gutter)",
        // The home indicator swallows a bare 20px, and the nav is what it
        // swallows.
        paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)",
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            // 44px of touch, without a taller bar: the height comes from the
            // target, not from padding stacked on top of it.
            className="flex min-h-11 items-center font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-[80ms]"
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
