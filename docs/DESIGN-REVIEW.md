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
