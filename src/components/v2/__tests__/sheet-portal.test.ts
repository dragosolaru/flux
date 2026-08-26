import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A modal must not depend on what happens to be above it in the tree.
 *
 * `position: fixed` resolves against the nearest ancestor carrying a transform,
 * not against the viewport. `.v2-rise` — the arrive-once animation on every
 * ScreenHeader — has `transform` in its keyframes with `fill-mode: both`, so it
 * stays a containing block after it finishes. The vehicle switcher lives inside
 * that header, so its sheet was laid out inside a **35px strip** at the top of
 * the page: no backdrop, and the car rows pushed out of view above it, leaving
 * only "add a car" visible. Measured in Chromium: an overlay 35px tall against
 * a viewport of 844.
 *
 * Nothing about that is visible from the source, and the next animation with a
 * transform in it would reintroduce it. So what is pinned here is the portal,
 * not the symptom.
 */
const SRC = join(process.cwd(), "src");

function read(relative: string): string {
  return readFileSync(join(SRC, relative), "utf8");
}

describe("Sheet", () => {
  const instrument = read("components/v2/instrument.tsx");

  it("renders into document.body rather than in place", () => {
    expect(instrument).toContain("createPortal");
    expect(instrument).toContain("document.body");
  });

  it("still positions itself against the viewport", () => {
    // The portal is only half of it: the overlay has to be fixed and full-bleed
    // for the backdrop to cover the screen at all.
    expect(instrument).toContain("fixed inset-0 z-[1200] flex items-end");
  });

  it("guards the server render without writing state in an effect", () => {
    // `document` does not exist on the server. useSyncExternalStore answers
    // differently on each side without a setState-in-effect, which the React
    // compiler lint rejects.
    expect(instrument).toContain("useSyncExternalStore");
  });
});
