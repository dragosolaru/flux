import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Every link in the navigation points at a page that exists.
 *
 * Written after shipping one that did not. Removing the command layer meant
 * deleting `/commands` and `/charging` and taking them out of the menus — and
 * the menus are three separate files. Two were edited by hand and the third,
 * `BottomNav.tsx`, was missed, so the mobile tab bar kept a **Încărcare** tab
 * pointing at a deleted route. It was caught by a screenshot from the phone,
 * which is not a review process.
 *
 * This is the same shape as the Tesla flag sweep: a hand-search across "all the
 * places that mention X" is wrong the moment there is a place you forgot. So
 * the check is derived — read the hrefs out of the nav files, list the pages
 * that actually exist, and compare. A tab that goes nowhere fails here rather
 * than on someone's phone.
 */
const SRC = join(process.cwd(), "src");
const APP = join(SRC, "app");

const NAV_FILES = ["Sidebar.tsx", "SlideUpMenu.tsx", "BottomNav.tsx"];

/** Every route that has a page, with Next's route groups — `(dashboard)` — removed. */
function existingRoutes(dir: string, found: Set<string> = new Set()): Set<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) existingRoutes(full, found);
    else if (entry.name === "page.tsx") {
      const segments = relative(APP, dir)
        .split(sep)
        .filter((s) => s.length > 0 && !s.startsWith("("));
      found.add(`/${segments.join("/")}`);
    }
  }
  return found;
}

function hrefsIn(file: string): string[] {
  const src = readFileSync(join(SRC, "components", "layout", file), "utf8");
  return [...src.matchAll(/href:\s*"(\/[^"]*)"/g)].map((m) => m[1]!);
}

describe("navigation", () => {
  const routes = existingRoutes(APP);

  it("finds the pages to check against", () => {
    // Guards against the sweep passing because the walk returned nothing.
    expect(routes.size).toBeGreaterThan(8);
    expect(routes.has("/dashboard")).toBe(true);
  });

  for (const file of NAV_FILES) {
    const hrefs = hrefsIn(file);

    it(`${file} declares at least one link`, () => {
      // If a regex change silently matched nothing, the loop below would pass
      // while checking nothing at all.
      expect(hrefs.length).toBeGreaterThan(0);
    });

    for (const href of hrefs) {
      it(`${file} → ${href} exists`, () => {
        expect(routes.has(href)).toBe(true);
      });
    }
  }
});
