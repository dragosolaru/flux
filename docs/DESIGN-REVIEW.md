# Flux — Design & Marketing Expert Panel

A standing panel of (composite) senior personas used to review the public
surfaces of Flux (landing `/`, product `/pricing`). Each review is logged here
with verdict + action items, so the rationale behind visual decisions is
traceable for the next contributor.

## The panel

| Persona | Background | Lens |
|---|---|---|
| **Mara Linde** | ex-Apple, Marketing Web / Human Interface | Hierarchy, typographic rhythm, whitespace discipline. "Lead with the message, never the chrome." |
| **Tomas Reinhardt** | ex-Tesla, Digital Product (tesla.com) | Motion as energy, "electric" feel, perceived speed, no jank. |
| **Sofia Brandt** | ex-BMW, Brand & Communications | Premium tone, restraint, multilingual copy correctness across EN/RO/DE/FR/HU. |
| **Devon Hale** | ex-Stripe / Linear, Front-end & Motion eng | Tasteful Framer Motion, mobile-first ordering, accessibility. |
| **Yuki Tanaka** | Growth / Social (viral product launches) | Thumb-stopping first screen, shareable, "is it alive?" |

---

## Review 01 — 2026-06-21 · Landing + Product (mobile)

**Context:** mobile screenshots of hero, bento "multi-brand" card, and the
Product page "Charging Map" feature block.

### Verdict
- **Mara:** Hero is strong now — Aurora + tight rhythm, message-first. But on
  feature rows the **visual sometimes appears before the title** on mobile, so a
  big number (€0.043) lands with no heading above it → reads as a *missing
  title*. On mobile, text must always lead.
- **Devon:** Root cause is the desktop zigzag (`flip`) leaking into the mobile
  stack order. Fix with CSS `order` at the `md:` breakpoint only — alternate on
  desktop, **always title-first on mobile**.
- **Tomas:** Good motion start (Aurora, count-up, pulse) but it's mostly
  *hover* — invisible on touch. Add **scroll-triggered** motion that plays on
  phones: equalizer bars that grow, staggered reveals.
- **Sofia:** The "Multi-brand" bento card has a hollow middle (`justify-between`
  stretching two short lines). Fill it with brand chips — intentional, premium.
- **Yuki:** First screen passes the thumb-stop test. Keep the headline punchy.

### Action items (this commit)
1. **Mobile order:** feature rows always render title → visual on mobile;
   zigzag (`flip`) applies only at `md+`. (LandingFeatureCost, product
   FeatureExplainers.)
2. **Bento multi-brand:** replace the hollow card with a brand-chip grid.
3. **More on-mobile motion:** smart-charge bars grow on scroll-in
   (staggered), reinforcing the "alive" feel without hover.
4. Empty-space audit: removed stretched `justify-between` where it created
   voids.

### Answers to the open questions
- *Are titles missing?* No — they were rendered **after** the visual on flipped
  mobile rows. Now fixed (title-first on mobile).
- *Should the rows interleave?* **Yes on desktop** (zigzag is a premium pattern
  — Apple/Stripe/Tesla). **No on mobile** — always lead with the title.
- *Empty spaces?* The bento "multi-brand" hollow is filled; stretched spacing
  removed.
- *Animated enough?* Hover was desktop-only; added scroll-triggered motion so
  phones feel alive too.

---

## Review 02 — 2026-06-21 · Charging Map — Station Detail Sheet (mobile)

**Context:** mobile screenshot of a tapped station ("Plugpoint", Florești). Two
complaints: (1) the address shows the street but **no house number**; (2) the
sheet looks dull ("anostă") — flat stat boxes, no action, no life.

### Verdict
- **Mara:** Hierarchy was flat — power (the number that matters) had the same
  weight as everything else. Make **power the hero stat**; give the card an
  energy accent instead of a plain border.
- **Tomas:** Zero motion = not "electric". The card should **arrive** (slide +
  fade), stats should **stagger in**, and an operational station should **pulse**
  (alive). A top gradient bar reads as energy.
- **Devon:** The address bug is upstream — the OSM connector captured
  `addr:street` but dropped `addr:housenumber`. Fix at ingestion (join them, like
  the BNetzA/Austria connectors already do). In the UI, render the **full**
  address (street + number, postcode + city, region), not just street + city.
- **Sofia:** A detail sheet with no primary action feels unfinished. Add a
  **Directions** button — the one thing a driver actually wants. Keep it premium:
  one clear CTA, restrained.
- **Yuki:** The pulsing "live" dot + the directions CTA make it feel actionable
  and shareable.

### Action items (this commit)
1. **Address data:** `overpass.ts` now joins `addr:street` + `addr:housenumber`
   (was dropping the number) — the root cause of the missing number in Florești.
2. **Fuller address UI:** sheet renders street, `postcode city`, and region on
   separate lines with a map-pin; falls back to `address_unknown` when empty.
3. **Directions CTA:** primary button → Google Maps directions to the station.
4. **Motion + hierarchy:** card slide-in, staggered children, pulsing
   operational status dot, gradient power hero, top energy accent bar.

### Note on data limits
House numbers only appear when the **source** has them. OSM (`addr:housenumber`)
and BNetzA/Austria carry them; for OSM we now keep it. OCM's `AddressLine1`
already includes the number when present. TomTom has no number field — those rows
stay street-only. Existing DB rows show the number after the next ingest pass.

---

## Review 03 — Charging map: compact card + zoom fix + send-to-car (2026-06-21)

### Context
Screenshot of E.ON Drive station card (Florești/Cluj). The card was still too large and heavy despite the first redesign — `rounded-3xl`, `md:max-w-md`, a 2-column stat grid with gradient boxes, a top accent bar. User also reported the map zooming out after stations load (losing the user's GPS position) and requested a "Share with vehicle (Tesla)" button that also triggers battery preconditioning, noting they'd seen Google Maps do this with a Tesla.

### Expert panel findings

- **Sofia:** The card occupied too much vertical space. Remove the 2-column grid boxes and the top accent bar — keep the gradient on the kW number only (the single hero metric), add a thin separator and inline connector count. Result: a truly compact pill-stat row. `md:max-w-sm` (not `md`).
- **Tomas:** The zoom-out bug was `FitStations` firing after every station batch regardless of whether user location was already resolved. Add an `enabled` prop to `FitStations` — disable it when a user location is known. Replace the old `SetView` (pan only) with `CenterOnUser` (sets view to zoom 12 once, guarded by a `done` ref).
- **Mara:** Send-to-Car = Google Maps' `navigation_gps_request` + `set_preconditioning_max`. Tesla auto-preconditions only for its own Superchargers — so for any third-party fast charger (≥50 kW, `operatorId !== "tesla"`) Flux must send `precondition_max` explicitly alongside the navigation command.
- **Devon:** Vehicle selection in a stateless sheet: `useVehicles()` returns all vehicles; prefer live Tesla (`dataSource === "live"`), fall back to first Tesla (demo). No UI selector — the sheet is for action, not configuration.
- **Yuki:** When no Tesla exists, show only Directions (full-width primary). When Tesla exists, show Send to Car (full-width primary) + icon-only Directions link. This preserves one clear CTA for each user context.

### Action items (this commit)
1. **Compact card:** `rounded-2xl`, `md:max-w-sm`, inline stat row (power | separator | connectors), no top accent bar. Power stays gradient hero.
2. **Send to Car:** `share_navigation` + optional `precondition_max` (parallel `Promise.all`). Toast: `send_to_car_success` or `send_to_car_preconditioned` depending on whether preconditioning fired.
3. **Zoom fix:** `FitStations` gets `enabled` prop (false when `userLocation` is set). `CenterOnUser` replaces `SetView` — calls `map.setView([lat, lng], 12)` once on first location resolve.
4. **i18n:** 5 new keys (`send_to_car`, `send_to_car_success`, `send_to_car_preconditioned`, `send_to_car_error`, `sending`) added to all 5 locales.
