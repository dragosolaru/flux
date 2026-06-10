# Unified Map Planner — Design Spec

Date: 2026-06-10 · Status: approved · Order of delivery: **A → C → B**

## Goal

Make the trip planner run on Flux's own charger database (now authoritative for
ro/de/fr/at/nl/hu via bulk imports), then unify the Trip Planner and Charging
Map into one map-first screen modeled on ABRP/Google Maps/Waze, validated by a
12-viewport agent QA pass in between.

## Phase A — Planner runs on the chargers DB

### Corridor station sourcing (`src/lib/external/routing/corridor-stations.ts`)

- PostGIS (`findInBBox`) becomes the **primary** source. Query per route
  segment: split the route polyline into segment bboxes (reuse the existing
  corridor walk), not one giant bbox. No artificial 8s timeout.
- **Delete** the static `STATIONS` array and the Overpass fallback.
- OCM live fallback fires **only** for segments whose bbox is not inside a
  bulk country (`bulkCountryContaining` from `src/lib/chargers/countries.ts`).

### Station filtering & scoring (`src/lib/external/routing/planner.ts`)

Filter out before candidate selection:
- `availability === "offline"`
- `confidence < 0.5`
- no connector compatible with the vehicle (see ModelSpec change below)

Replace the current sort (power desc, distance asc) with a score:
- charging power (effective: `min(station, vehicle)`) — dominant term
- detour distance — penalty
- real price `pricing.perKwh` when present (fallback: average tariff) — penalty
- multiple stalls (`connectors[].count` sum ≥ 4) — small bonus
- `availability === "stale"` — small penalty

Stop cost uses the station's real `pricing.perKwh` when present.

### Vehicle connector support (`src/lib/brands/models.ts`)

Add `supportedConnectors: ConnectorType[]` to `ModelSpec`. Tesla models:
`["ccs2", "tesla"]`. `chargerToStation` maps `Charger.connectors` faithfully
instead of hardcoding CCS.

### Error handling

- Corridor segment with zero usable stations → plan warning names the gap
  ("no coverage between X and Y km"), plan still returned (feasible flag as
  today).
- OSRM-down approximate-route behavior unchanged.

### Tests

Vitest units: connector-compatibility filter, scoring order (power vs price vs
detour trade-offs), offline/low-confidence exclusion.

## Phase C — Agent QA matrix (12 viewports)

Run `npm run build && npm start`, then agents in waves of 4, each with browser
automation at its own viewport, its own fresh account:

320×568, iPhone SE 375×667, Galaxy S20 360×800, iPhone 14 390×844,
iPhone 14 Pro Max 430×932, Pixel 7 412×915, small Android 360×640,
iPad portrait 768×1024, iPad landscape 1024×768, laptop 1280×800,
desktop 1920×1080, ultrawide 2560×1080.

Flow per agent: signup → onboarding → dashboard → map/planner (plan a real RO
route, e.g. București→Cluj) → station detail → settings → language switch.

Report per agent: functional bugs, overflow/clipped elements, tap targets
< 44px, missing loading/empty/error states, layout breaks — with screenshots.
Output: one consolidated triaged report ([BLOCKER]/[WARN]/[OK]) that feeds
Phase B.

## Phase B — Unified "Map" screen (map-first)

### Structure

- One screen replaces `/trip` and `/charging-map`. BottomNav: "Trip" +
  "Charging" map tabs merge into **"Hartă" (Map)**; nav stays 4 slots: Car,
  Hartă, Charging (sessions page), More.
- Old routes `/trip` and `/charging-map` redirect to the new screen (deep
  links keep working).

### Explore mode (default)

Current charging-map experience: full-screen map, station pins, filters,
cold-area polling indicator — plus a floating search pill "Unde mergi?" on
top.

### Route mode (after destination chosen)

- Origin defaults to user/vehicle location; editable.
- Draggable bottom sheet, 3 detents:
  - **collapsed**: duration · km · € · arrival time
  - **mid**: variant chips (Rapid / Ieftin / Puține opriri) + numbered stop rows
  - **full**: stop details, share-to-Tesla, fuel comparison (existing
    CostSummary content)
- Numbered green pins for stops on the map; route polyline; other stations
  dimmed.
- Exit route mode → back to explore mode (X on the search pill).

### Implementation notes

- Reuse and restyle existing components: `StationMap`, `ChargerDetailSheet`,
  `GeocodingSearch`, `StopCard`, `CostSummary`, `TripMap` merges into
  `StationMap`.
- Plan fetching moves to TanStack Query (cache survives tab switches).
- i18n: every new string in all 5 locales (en/ro/de/fr/hu).
- All Phase C findings on these screens fixed as part of B.

## Out of scope

- Live traffic rerouting (Waze-style), turn-by-turn navigation.
- Charger availability live polling per stop.
- Redesign of Dashboard/Settings (QA fixes only, no redesign).

## Acceptance

- Planner returns plans whose stops are all DB chargers (in bulk countries),
  connector-compatible, not offline, confidence ≥ 0.5.
- Static STATIONS list deleted; Overpass fallback deleted.
- Unified screen passes the 12-viewport matrix with zero [BLOCKER]s.
- `tsc`, `lint`, vitest green; FEATURES.md updated per phase.
