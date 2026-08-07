import type { Page } from "@playwright/test";

export type Control = {
  tag: string;
  name: string;
  width: number;
  height: number;
  /** Computed `display`. `inline` marks the WCAG 2.5.8 "inline" exception —
   *  a link flowing inside a sentence is sized by the text, not by the author. */
  display: string;
  centerX: number;
  centerY: number;
};

/**
 * WCAG 2.5.8 (AA) "Target Size (Minimum)" — a target smaller than `minimum`
 * only fails if neither documented exception applies:
 *
 *  - Inline: the target is a link flowing inside a block of text.
 *  - Spacing: a circle of diameter `minimum` centred on the target does not
 *    intersect the equivalent circle of any other target, i.e. the distance
 *    between the two centres is at least `minimum`.
 *
 * Without the spacing exception this check flags every compact footer/nav link
 * on the site, which the standard explicitly permits.
 */
export function targetSizeViolations(controls: Control[], minimum: number): Control[] {
  const farFromEveryOtherTarget = (control: Control) =>
    controls.every(
      (other) =>
        other === control ||
        Math.hypot(control.centerX - other.centerX, control.centerY - other.centerY) >= minimum,
    );

  return controls
    .filter((control) => control.width < minimum || control.height < minimum)
    .filter((control) => !(control.tag === "a" && control.display === "inline"))
    .filter((control) => !farFromEveryOtherTarget(control));
}

/**
 * Controls whose accessible name is empty, taken from Playwright's ARIA
 * snapshot so the real accessible-name algorithm is used (aria-label,
 * aria-labelledby, nested img alt, svg title, …) rather than a DOM guess.
 *
 * Snapshot lines look like `- button "Sign in"` when named and `- button`
 * (optionally with a trailing `:` for children) when not.
 */
export async function unnamedControls(page: Page): Promise<string[]> {
  const snapshot = await page.locator("body").ariaSnapshot();
  return snapshot
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^- (button|link|checkbox|switch|tab|menuitem)\b/.test(line))
    .filter((line) => !/"/.test(line))
    .map((line) => line.replace(/:$/, ""));
}

/**
 * Interactive elements nested inside other interactive elements. Invalid HTML
 * and a real screen-reader/keyboard trap: the inner control is often
 * unreachable, and click targets overlap ambiguously.
 */
export async function nestedInteractives(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll(INTERACTIVE))
      .filter((el) => el.parentElement?.closest(INTERACTIVE))
      .map((el) => {
        const outer = el.parentElement!.closest(INTERACTIVE)!;
        return `${outer.tagName.toLowerCase()} > ${el.tagName.toLowerCase()}`;
      });
  });
}

/** Every visible interactive control with its rendered box. */
export async function visibleControls(page: Page): Promise<Control[]> {
  return page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll('button, [role="button"], a[href], input:not([type="hidden"])'),
    );
    return nodes
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const label =
          el.getAttribute("aria-label") ??
          (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim() ??
          "";
        return {
          tag: el.tagName.toLowerCase(),
          name: label.slice(0, 40),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          display: getComputedStyle(el).display,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2,
        };
      });
  });
}

export function describe(control: Control): string {
  return `<${control.tag}> "${control.name}" ${control.width}x${control.height} (${control.display})`;
}
