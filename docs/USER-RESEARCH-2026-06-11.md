# Flux — User Research Summary (2026-06-11)

## Overview

Average score across 10 personas: **5.67/10**. The core experience (SOC hero, vehicle switching, trip planning flow) reads as polished and fast, but accessibility failures and onboarding friction are actively blocking adoption by non-technical users and users with visual impairments. Monetization messaging consistently confuses users at the exact moment they hit a limit, undercutting the upgrade conversion rate.

---

## Top Issues by Priority

### P0 — Accessibility (fix before launch)

These issues violate WCAG AA and are likely illegal to ship in EU markets.

| Issue | Detail | Affected personas |
|-------|--------|------------------|
| `text-[10px]` on semantic labels | Settings section headers, stat chip labels, auth form labels all render at 10px — Apple HIG minimum is 11px, WCAG practical minimum is 12px. Fails at system Large Text settings. | Mihai (55), Maria (45) |
| `text-muted-foreground/40` opacity | 40% opacity muted text on dark backgrounds drops well below the 4.5:1 contrast ratio required for WCAG AA normal text. | Mihai |
| Auth input borders at ~12% opacity | Borderless-looking inputs in `src/components/auth/LoginForm.tsx` (and base `src/components/ui/input.tsx`) make form fields invisible to users with low contrast sensitivity. | Mihai |
| `font-thin` on critical numbers | Battery percentage, scores, and key numeric data rendered with `font-thin` cause digits to merge on sub-retina screens (iPhone SE, budget Androids). | Mihai |
| CollapsibleSection chevron `size-3` | 12px tap target in `src/app/(dashboard)/settings/settings-client.tsx` is far below the 44px minimum. Cannot be reliably tapped on mobile. | Mihai |
| Auth label font size 10px | Login/register form labels at 10px fail readability for 45+ age group with average vision. | Maria |

**Immediate fix target:** Audit every `text-[10px]` and `text-xs` occurrence, raise muted-foreground opacity to at least 60%, set auth input border to 25%+ opacity.

---

### P1 — Onboarding friction (fix before launch)

New users (especially non-technical) are confused before they experience any value.

| Issue | Detail | Affected personas |
|-------|--------|------------------|
| VIN asked upfront in AddVehicleModal | `src/components/onboarding/AddVehicleModal.tsx` surfaces VIN as an early required field. New EV owners don't know what a VIN is or where to find it. | Sofia |
| OnboardingOverlay copy is generic | `src/components/onboarding/OnboardingOverlay.tsx` uses vague placeholder-level copy that doesn't tell users what they will gain. | Maria |
| "Conectează Tesla" appears 3+ times | Multiple entry points for Tesla connection create a circular flow. Users don't know if they're reconnecting or connecting for the first time. | Sofia |
| Scenario picker too early | Asking for charging scenario on day 1 before the user has established any routine creates decision paralysis. | Sofia |
| Stat chips meaningless without context | The chips below the SOC hero (`src/app/(dashboard)/dashboard/dashboard-client.tsx`) show numbers (temperature, odometer) without explaining what to do with them or why they matter. | Sofia |
| ✦ symbol unexplained | The capability-lock symbol appears in the UI with zero tooltip or legend. New users assume it's decorative or a bug. | Maria |

**Recommended flow change:** VIN optional/scannable, scenario picker deferred to day 2 (or after first charge event), add a one-line legend for ✦ on first encounter.

---

### P2 — Trip planning UX (fix soon)

The trip planner works but silently hides failure states, which erodes trust.

| Issue | Detail | Affected personas |
|-------|--------|------------------|
| Infeasible routes silently hidden | `src/app/(dashboard)/trip/trip-client.tsx` and `src/lib/external/routing/planner.ts` drop infeasible route alternatives without explanation. User sees 1 result when 2–3 were computed; no message explains why. | Dan |
| Stale station availability shown as viable | Charging stations with stale availability data are presented in route results without a staleness indicator, leading to wasted stops. | Dan |
| Route variant labels unclear | Fastest / cheapest / fewest-stops variants exist but labels don't make the trade-off explicit. Users don't know what they're choosing. | Radu |
| 0-stop trips give no confirmation | When a short trip needs zero charging stops, the planner shows no affirmation message. Users assume something is wrong or the plan didn't run. | Radu |
| Florești disambiguation missing country hint | Location search returns the Romanian Florești without a country context hint in the UI, confusing cross-border users. | Dan |
| Cost estimate assumes single tariff | The trip cost estimator uses one flat tariff across the entire route, giving materially wrong estimates for cross-border EU trips. | Dan |
| OLED burn risk on budget Android | Dark OKLCH background values in the dashboard may trigger OLED pixel burn on budget devices (Dacia Spring drivers, entry Android). | Radu |

---

### P3 — Monetization clarity (fix soon)

Users hit paywalls before they understand what they're paying for, which kills conversion.

| Issue | Detail | Affected personas |
|-------|--------|------------------|
| FeatureGate shows no context | `src/components/layout/FeatureGate.tsx` shows "unlock" with no explanation of what the feature does or what tier unlocks it. | Laura, Maria |
| Generic "upgrade" message | Free tier limit messaging says "upgrade" rather than "You've used 3/3 receipts this month — upgrade to Pro for unlimited." | Maria, Laura |
| Limits discovered accidentally | Free tier limits are not surfaced proactively; users stumble into them mid-task, which creates frustration rather than motivation. | Laura |
| No value proposition at friction point | The FeatureGate moment is the highest-intent upgrade opportunity. Currently it's wasted with no pricing, no feature description, no "what you get" summary. | Laura |

**Recommended copy pattern for FeatureGate:** `[Feature name]: [One sentence of value]. You're on the Free plan — upgrade to [Plan] for [specific benefit]. [CTA button]`

---

### P4 — Power user depth (roadmap)

These are product gaps that require significant engineering investment and are not blocking launch.

| Issue | Detail | Affected personas |
|-------|--------|------------------|
| No multi-vehicle cost aggregation | `src/app/(dashboard)/costs/costs-client.tsx` is per-vehicle only. Fleet managers must switch + export 3× to compare. | Alex |
| No fleet-level KPIs | No total fleet cost view, no cost/km comparison across vehicles. | Alex |
| No batch fleet CSV export | Each vehicle export is manual and separate. | Alex |
| Smart charging algorithm is `reduce()` loop | Thomas (Tibber power user) correctly identifies the smart charging recommendation as a greedy reduce over cheapest hours, not ML optimization. Acceptable now, not differentiating at scale. | Thomas |
| Tibber webhook not implemented | 1-hour polling for Tibber price data means the smart charging window can be stale. Webhook support would enable real-time recommendations. | Thomas |
| Trip planner ignores home vs public cost differential | A user with cheap home Tibber rates should see a different cost model than one using only public chargers. Currently undifferentiated. | Thomas |

---

## Quick Wins (can fix in 1 day)

Changes estimated at under 30 minutes each, with file references:

| # | Fix | File | Est. |
|---|-----|------|------|
| 1 | Add Y-axis unit label "ct/kWh" to PriceCurveChart | `src/components/energy/PriceCurveChart.tsx` | 5 min |
| 2 | Replace "ggü" with "gegenüber" (or contextual equivalent) in German locale | `src/lib/i18n/locales/de.json` | 5 min |
| 3 | Show Tibber connection status indicator (connected / polling / error) | `src/components/energy/PriceCurveChart.tsx` or settings Tibber section | 20 min |
| 4 | Add contextual free-tier message: "You've used X/3 receipts" | `src/components/layout/FeatureGate.tsx` | 15 min |
| 5 | Match skeleton chip count to actual chip count (pre-compute from vehicle state) | `src/app/(dashboard)/dashboard/dashboard-client.tsx` (StatChips skeleton) | 15 min |
| 6 | Add "0 stops needed — your battery is sufficient" confirmation in trip planner | `src/app/(dashboard)/trip/trip-client.tsx` | 10 min |
| 7 | Show infeasible routes with a warning badge instead of hiding them | `src/app/(dashboard)/trip/trip-client.tsx` + `src/lib/external/routing/planner.ts` | 25 min |
| 8 | Raise auth input border opacity from ~12% to 25%+ | `src/components/ui/input.tsx` | 5 min |
| 9 | Raise `text-muted-foreground` opacity from `/40` to at least `/60` in critical label contexts | Global — audit with grep for `muted-foreground/40` | 20 min |
| 10 | Add one-line tooltip/legend for ✦ symbol on first encounter | `src/components/layout/FeatureGate.tsx` | 15 min |

---

## Feature Gaps (roadmap items)

These require product scoping and meaningful engineering time:

**Fleet / multi-vehicle aggregate view**
A "Fleet" mode on the costs page showing total fleet spend, per-vehicle cost/km, and batch CSV export. Unblocks fleet manager segment (Alex persona archetype represents a real SMB acquisition channel).

**Smart charging ML optimization**
Replace the greedy `reduce()` cheapest-hour picker with a proper optimization pass that accounts for: charge rate curves, departure time constraints, grid carbon intensity (for eco-conscious users), and tariff block pricing. This is a meaningful moat if done well.

**Tibber real-time webhook**
Replace 1-hour polling with Tibber's push webhook. Would enable true real-time smart charging triggers and improve the perceived quality of the Tibber integration significantly for power users.

**Trip cost model: home vs public differential**
Allow users to specify their home charging rate separately from public rates. The trip cost estimator should blend the two based on where stops occur (home, en-route public, destination).

**Cross-border tariff zones in trip planner**
Route cost estimation for international trips needs per-country average public charging tariffs, not one flat rate. Dataset is small (~30 countries) and could be manually curated initially.

**Scenario picker deferred + progressive profiling**
Move the charging scenario selection out of AddVehicleModal day-1 onboarding into a post-first-charge prompt. Implement progressive profiling so the app learns routine from actual charge events rather than asking upfront.

---

## Persona Scoreboard

| Persona | Score | Top Pain | Top Praise |
|---------|-------|----------|------------|
| Andrei, 28, tech Cluj | 7.2/10 | Skeleton states unfinished; BottomNav hides too aggressively on short scroll | SOC hero numbers, spring nav transitions, pull-to-refresh |
| Maria, 45, HR București | 6.5/10 | Generic onboarding copy; settings needs grouping; 10px auth labels | Google Sign-In obvious; IngestCard 3 upload paths clear |
| Dan, 35, expat Dublin | 6.0/10 | Infeasible routes silently hidden; stale station data; flat tariff model | Geocoding bias works; multi-provider fallback solid |
| Elena, 32, Hamburg | 6.5/10 | PriceCurveChart Y-axis no unit; Tibber fails silently; currency not localized | Smart charging window clear; German translation solid |
| Mihai, 55, Timișoara | 5.0/10 | 10px text everywhere; low contrast; invisible auth inputs; font-thin on numbers | 44px tap targets met; dark mode contrast acceptable overall |
| Sofia, 25, București | 5.0/10 | VIN asked upfront; circular Tesla connection flow; stat chips context-free | Onboarding animations clean; SOC instantly obvious |
| Alex, 38, fleet manager | 5.0/10 | No multi-vehicle cost view; no fleet KPIs; vehicle switcher is navigation not filter | Vehicle switching fast; CSV export exists |
| Radu, 42, Florești-Cluj | 6.0/10 | OLED risk on budget Android; 0-stop plans show no confirmation; variant labels vague | SOC hero perfect; trip planning relatively low tap count |
| Laura, 30, Iași | 4.0/10 | FeatureGate shows no context or price; limits discovered accidentally mid-task | ✦ symbol is at least a visible lock indicator |
| Thomas, 29, Berlin | 5.0/10 | Algo is greedy reduce not optimized; no Tibber webhook; ignores home/public cost split | Tibber integration real-time feel; price curve UI cleaner than Tibber's own app |

**Average: 5.67/10**

---

## Wave 2 — Batch 1 (2026-06-12): International personas

Five additional personas from Moldova, France, Finland, Romania (UX designer), Belgium.

| Persona | Score | Top Pain | Top Praise |
|---------|-------|----------|------------|
| Bogdan, 32, Chișinău MD | 8/10 | All data is mock; no Moldovan energy providers (Union Fenosa); `"trip"` key left in English in ro.json | Trip planner RO corridor; costs in lei; minimalist mobile UI |
| Isabelle, 41, Lyon FR | 6/10 | `formatRelativeTime` hardcoded English ("now"/"3h ago") on chip; `fmtRon()` ignores currency → RON shown to FR users; Tesla-centric copy alienates Peugeot users | French translations excellent; dashboard visual quality; trip planner for road trips |
| Sven, 45, Helsinki FI | 6/10 | Cold derating formula uses 0.5%/°C — at −20°C shows −17.5% but real is 30-40%; weather data is mock-only; no HVAC load model | Battery health history; trip planner SoC curves; preconditioning badges |
| Carolina, 28, Bucharest RO (UX designer) | 7.5/10 | `formatRelativeTime` hardcoded English; chip `w-[96px]` without `truncate`; SlideUpMenu X button `rounded-md` on `rounded-t-3xl` sheet (visual inconsistency) | OKLCH navy color tokens; ambient tinting; floating pill nav with easing |
| Kevin, 35, Antwerp BE | 7/10 | No multi-vehicle org/fleet structure; cost tracking RON-hardcoded; no fleet reporting/export | Trip planner highway corridors; OCR cost tracking; charging map with kW filter |

**Wave 2 Batch 1 average: 6.9/10** (up from 5.67 Wave 1 — design improvements visible)

### Bugs fixed from Wave 2 Batch 1

- `formatRelativeTime()` → now uses i18n keys (`dashboard.time_now/time_min_ago/time_hour_ago/time_day_ago`) in all 5 locales
- `nav.trip` in ro.json → "Planificator de trasee" (was "Trip planner")
- `nav.mobile.trip` in ro.json → "Traseu" (was "Drum")
- SlideUpMenu X button → `rounded-full` (was `rounded-md`)
- Stat chip value → `truncate` class added (was overflow-unsafe)
- Cold weather derating formula → piecewise model: 1%/°C (15→0°C), 1.5%/°C (0→−10°C), 2%/°C (<−10°C)

---

## Wave 2 — Batch 2 (2026-06-12): Mountain/analytical/architect/non-tech/international

| Persona | Score | Top Pain | Top Praise |
|---------|-------|----------|------------|
| Florin, 39, Brașov RO (mountain guide) | 6/10 | No offline support; no elevation derating (uphill costs 15-20% extra); sparse Carpathian charging coverage | OSRM real-road routing; piecewise cold derating; OCM+Overpass stations |
| Amira, 34, Toulouse FR (aerospace engineer) | 5/10 | Petrol comparison hardcoded to RON constants; no per-session charge curve (kW, SoC%, duration); French tariffs missing (EDF, Engie) | CSV export schema clean; Wh/km KPI; OCR receipt scanning |
| Patrick, 44, Dublin IE (senior architect) | 7/10 | `reverseGeocode` called Nominatim directly from browser (GDPR/rate-limit bypass); in-memory rate limiting; Stripe idempotency #31 open | Auth/ownership patterns solid; mock/live gating clean; AES-256-GCM token encryption |
| Miriam, 52, Vienna AT (non-technical) | 6/10 | Austrian tariff providers missing (only Romanian shown); settings 7+ sections overwhelming; no data collection disclosure screen | SOC hero readable; German translations natural; round action buttons obvious |
| Mehmet, 31, Istanbul TR (commuter) | 6/10 | All costs in RON; no Turkish locale; Turkey not in bulk charger import | OCR receipt (WhatsApp ingest); smart charge timing concept; trip planner |

**Wave 2 Batch 2 average: 6.0/10**

### Bugs fixed from Wave 2 Batch 2

- `reverseGeocode()` in `map-client.tsx` → now proxied through `/api/geocode?reverse=1` instead of calling Nominatim directly from browser (fixes GDPR GPS leak + rate-limit bypass; Patrick's finding)
- `/api/geocode` route → added reverse geocoding handler (`?reverse=1&lat=&lon=`) server-side with auth + rate-limit

---

## Wave 2 — Batch 3 (2026-06-12): Shift workers, skeptics, analysts, small-screen, engineers

| Persona | Score | Top Pain | Top Praise |
|---------|-------|----------|------------|
| Daniela, 36, Cluj RO (nurse, shift worker) | 6/10 | Smart charging optimizes for cheapest rate only — no departure-time constraint ("100% by 6am") | Dashboard clear in Romanian; charging history by location |
| Piotr, 48, Gdańsk PL (VW ID.4 user) | 5/10 | Non-Tesla users can't enter real vehicle specs; hardcoded Bucharest default coords; Romanian tariff providers shown to PL users; mock weather | Trip planner uses real roads (OSRM); OCM station data |
| Yuki, 29, Frankfurt DE (data analyst) | 6.5/10 | Mixed currency: costs in RON but smart-charge savings in € on same screen; `map.explore_hint` uses formal "Ihrer" (Sie-form) vs rest "du"; Romanian tariffs shown to DE users | Smart charge schedule concrete timing; OCR receipt ingestion |
| Valentina, 33, Madrid ES (iPhone 13 mini) | 7/10 | Chip row has no scroll peek on 375px screen; quick-action buttons 36px (< 44px HIG minimum); Tesla-centric copy | Ambient glow tinting; floating pill nav; font-thin SOC hero |
| Andile, 27, Eindhoven NL (ASML engineer) | 7.5/10 | Bottom sheet hand-rolled (~350 lines) with PEEK constant vs hardcoded `68` off-by-one; wind derating assumes headwind always; no Dutch tariff providers | Piecewise cold derating; real-road OSRM routing; personal efficiency derivation |

**Wave 2 Batch 3 average: 6.4/10**

### Bugs fixed from Wave 2 Batch 3

- `de.json` `map.explore_hint`: "Ihrer Nähe" (Sie-form) → "deiner Nähe" (du-form) for consistency
- Quick action buttons: `size-9` (36px) → `size-11` (44px) to meet Apple HIG 44pt minimum

### Known issues logged (not yet fixed)

- Smart charging needs departure-time constraint ("ensure 100% by 06:00") — separate from tariff optimization
- Petrol comparison constants hardcoded to RON in `src/app/api/costs/route.ts` (PETROL_PRICE_RON=7.5, PETROL_L_PER_100KM=7) — needs user-configurable or exchange-rate-based currency conversion
- No elevation/altitude derating for mountain routes (significant for Carpathians, Alps)
- No per-session charge curve export (kW delivered, SoC%, duration)
- Austrian/Western EU tariff providers missing from the provider registry
- Turkish locale (tr) not implemented; Turkey not in bulk charger country list

---

## Methodology note

This synthesis is based on structured persona reviews conducted in June 2026. Each persona was given a scripted task set covering: vehicle connection, dashboard reading, trip planning, cost intelligence, smart charging, settings configuration, and upgrade/paywall encounter. Reviews were scored on a 10-point scale (overall experience quality). Personas were selected to span age range (25–55), geography (RO, DE, IE), device profile (iPhone SE to iPhone 15, mid-range Android), EV experience level (new owner to power user), and use case (personal, expat cross-border, fleet management).

Pain points are ranked by: (1) severity of user impact, (2) frequency across personas, (3) regulatory/legal risk (accessibility). Quick wins were validated against the codebase — file references are accurate as of 2026-06-11. Scores represent individual reviewer perception, not A/B test data; treat as directional signal, not statistically significant measurement.
