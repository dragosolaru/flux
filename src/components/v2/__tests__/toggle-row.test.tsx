import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ToggleRow } from "../instrument";

/**
 * A switch must not report a state the car has never sent.
 *
 * This is the same defect the screen has now had three times in three
 * different shapes: a status row that fell through to "Parcată" when there was
 * no reading, a command row that printed "BLOCATĂ" for a null, and — if this
 * were wrong — a switch resting at "off" for a field the car has not reported.
 * Each one produces a confident, wrong statement rendered identically to a true
 * one, which is the only kind of bug this screen can have that a driver cannot
 * catch.
 *
 * ARIA has the same trap: `role="switch"` accepts only true/false, so an
 * unknown state announced through it would be flattened to "not checked". The
 * tri-state role is `checkbox`, whose `aria-checked` does allow "mixed".
 */
function render(on: boolean | null, state?: string): string {
  return renderToStaticMarkup(
    <ToggleRow label="Blocare uși" on={on} state={state} onToggle={() => undefined} />,
  );
}

describe("ToggleRow", () => {
  it("announces a known state as a switch", () => {
    expect(render(true, "Blocate")).toContain('role="switch"');
    expect(render(true, "Blocate")).toContain('aria-checked="true"');
    expect(render(false, "Deblocate")).toContain('aria-checked="false"');
  });

  it("announces an unreported state as mixed, never as off", () => {
    const html = render(null);
    expect(html).toContain('aria-checked="mixed"');
    expect(html).not.toContain('aria-checked="false"');
    // role=switch would force the lie; checkbox is the role that carries mixed.
    expect(html).toContain('role="checkbox"');
  });

  it("shows no state word when the car has not reported", () => {
    // The caller is responsible for passing no word, but the row must not
    // invent one either — nothing on the right except the switch itself.
    expect(render(null)).not.toContain("Blocate");
    expect(render(null)).not.toContain("Deblocate");
  });

  it("puts the knob in three distinguishable places", () => {
    // Centred for unknown, and the track is dashed as well — seven pixels of
    // travel is not a difference a thumb can see on a phone.
    expect(render(true, "Blocate")).toContain("left:17px");
    expect(render(false, "Deblocate")).toContain("left:3px");
    expect(render(null)).toContain("left:10px");
    expect(render(null)).toContain("border-style:dashed");
  });
});
