# FEATURES — Flux Feature Catalog

> Fast-onboarding map of what Flux does, where each feature lives, and what it depends on.
> Flux is a Next.js SaaS for EV (Tesla) owners: live vehicle state, remote commands, AI cost tracking, energy tariffs, charging map, and trip planning.
>
> For architecture and data flows read `CODEBASE_CONTEXT.md`. For third-party wiring read `docs/SYSTEMS.md`. For the OCR pipeline read `docs/COST-INTELLIGENCE.md`.

**Live vs mock:** Almost everything runs against a mock simulator by default. Live Tesla integration is gated by the `LIVE_INTEGRATIONS` env var (`isLiveEnabled("tesla")` in `src/lib/live-integrations.ts`). With it unset, vehicle state, commands, and charging history are served by the mock engine. The Tesla Fleet API code is in-tree but dormant (see `docs/VEHICLE-CONNECTION.md`).

---

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16 (App Router) | `after()` for background work |
| Language | TypeScript strict | no `any` |
| Auth | NextAuth (Auth.js) v5 | Google OAuth + email/password credentials; JWT sessions |
| Database | Supabase (Postgres + RLS) | admin client server-side only |
| Storage | Supabase Storage | private `documents` bucket |
| Client state | TanStack Query v5 | vehicle state polling |
| i18n | next-intl v4 | 5 locales: `ro` (default), `en`, `de`, `fr`, `hu` |
| Styling | Tailwind CSS v4 + shadcn/ui | next-themes dark mode |
| AI / OCR | Anthropic Claude (`@anthropic-ai/sdk`) | `claude-sonnet-4-6` vision |
| Payments | Stripe (`stripe` v22) | checkout, portal, webhooks |
| Maps | Leaflet + react-leaflet | charging map, trip map |

**External services:** Anthropic Vision (OCR), Stripe (billing), Supabase (DB/storage), Cloudmailin (inbound email), Twilio-style WhatsApp inbound, OSRM (`router.project-osrm.org` routing), Nominatim (geocoding), BNR (RON exchange rates), Tibber (optional live tariffs), Tesla Fleet API (dormant).

---

## App map

Dashboard pages live under `src/app/(dashboard)/` (auth-gated layout):

| Route | Page | Feature |
|-------|------|---------|
| `/dashboard` | Main vehicle dashboard | live SOC, range, location, cards |
| `/garage` | Garage | add / list vehicles |
| `/charging` | Charging | sessions list + history sync |
| `/commands` | Commands | remote Tesla commands |
| `/costs` | Costs | OCR cost dashboard + ingest |
| `/insights` | Insights | savings vs petrol, CO₂, activity, battery health, efficiency |
| `/energy` | Energy | tariff prices + smart charge timing |
| `/charging-map` | Charging map | station map |
| `/trip` | Trip planner | ABRP-style route + charging stops |
| `/map` | Unified map | combined trip planner + station browser |
| `/settings` | Settings | locale, currency, home, tariff, account, billing |
| `/about-data` | About your data | privacy / data transparency page |

Auth pages (`/login`, `/register`) live outside the dashboard group.

---

## 1. Authentication

**What:** Email/password and Google sign-in via NextAuth v5. Sessions are JWT; `session.user.id` is the NextAuth UUID, bridged to Supabase `auth.users` by `ensureSupabaseUserId`.

**How to use:** UI `/login`, `/register`. API: `POST /api/auth/register` (creates Supabase auth user, IP rate-limited 5/hr), `GET/POST /api/auth/[...nextauth]` (NextAuth handlers).

**Key files:** `src/lib/auth.ts` (providers, callbacks), `src/app/api/auth/register/route.ts`, `src/lib/supabase/ensure-user.ts`, `src/components/auth/LoginForm.tsx`.

**Dependencies:** NextAuth, Google OAuth, Supabase Auth.

---

## 2. Vehicles / Garage

**What:** Add and list vehicles. New vehicles are created in **mock** mode (`data_source: "mock"`) and seeded with an initial snapshot. Free tier is capped at 1 vehicle (`canAddVehicle`).

**How to use:** UI `/garage`. API: `GET /api/vehicles` (list, user-scoped), `POST /api/vehicles` (add mock vehicle + seed snapshot), `GET/PATCH/DELETE /api/vehicles/[vehicleId]`.

**Key files:** `src/app/api/vehicles/route.ts`, `src/lib/mock/seed.ts`, `src/lib/subscription.ts`, `src/hooks/useVehicles.ts`.

**Dependencies:** Supabase. Tesla Fleet API only when a vehicle is connected live.

---

## 3. Dashboard (live vehicle state)

**What:** Real-time vehicle state — SOC, range, location, climate, doors/windows, tires, software, scores, battery health, weather-derated range. Polls every 30s.

**How to use:** UI `/dashboard`. API: `GET /api/vehicles/[vehicleId]/state` (rate-limited, ownership-checked; live → Tesla `/vehicle_data`, mock → `tick(snapshot)`), plus `GET .../battery-health` and `GET .../weather`.

**Key files:** `src/hooks/useVehicle.ts`, `src/app/api/vehicles/[vehicleId]/state/route.ts`, `src/lib/mock/engine.ts`, `src/components/vehicle/*` (StatsGrid, BatteryHealthCard, DoorsWindowsCard, TirePressureCard, WeatherRangeCard, etc.).

**Dependencies:** Supabase, Tesla Fleet API (live), mock engine (default). Weather is mock-only (`mock-weather.ts`).

### 3a. Dashboard polish — live badge pulse + pull-to-refresh

**What:** (1) The `LiveBadge` status dot animates with a framer-motion opacity pulse (`[1, 0.4, 1]`) while `isFetching` is true, switching to static blue. (2) Mobile pull-to-refresh: `usePullToRefresh` detects a downward touch drag from `scrollTop === 0` and calls `refetch()` when the threshold (70 px) is crossed. A `Loader2` spinner appears at the top of the dashboard on mobile (`md:hidden`) while pulling or fetching, wrapped in `AnimatePresence` for a smooth fade.

**How to use:** UI `/dashboard` — pull down on mobile to refresh; the Live badge pulses blue during any background fetch.

**Key files:** `src/hooks/usePullToRefresh.ts` (gesture hook, returns `isPulling` + `pullProgress`), `src/app/(dashboard)/dashboard/dashboard-client.tsx` (wires everything), `src/lib/i18n/locales/*.json` (`dashboard.pull_to_refresh`, `dashboard.refreshing`).

**Dependencies:** framer-motion v12, TanStack Query v5 (`isFetching`, `refetch`).

### 3b. Flux 2027 Design System — Dashboard Ambient Numbers

**What:** Visual redesign of the dashboard hero and quick-action row.
- Hero SOC floats directly on the page background — no card chrome. Battery percentage is `text-7xl font-thin tracking-tight`; range below in `text-lg font-light text-muted-foreground`.
- Live badge status dot gains `animate-pulse` while `isFetching === true`.
- Ambient body tinting: a `useEffect` adds `ambient-charging` / `ambient-low` / `ambient-full` CSS class to `document.body` based on battery level (≥80% → full, ≤20% → low, charging → charging). Classes are cleaned up on unmount. The 1.4s background-color transition in `globals.css` gives a slow ambient colour shift.
- Quick-action buttons (climate, lock, charge) are now `size-9 rounded-full` icon-only circles with `bg-white/8 backdrop-blur-sm`. Text labels removed; `title` + `aria-label` retained for accessibility.

**How to use:** UI `/dashboard`. No new API routes or user settings.

**Key files:** `src/app/(dashboard)/dashboard/dashboard-client.tsx` (all changes), `src/app/globals.css` (`.ambient-*` classes + body transition).

**Dependencies:** framer-motion v12, TanStack Query v5 (`isFetching`).

---

## 4. Charging

**What:** Lists charging sessions and syncs charging history. Charge limit / scheduled charging are issued through the command system (section 5).

**How to use:** UI `/charging` (server-rendered sessions from `charging_sessions`). API: `POST /api/vehicles/[vehicleId]/charging-history` (live → `fetchTeslaChargingHistory`, mock → simulated sessions).

**Key files:** `src/app/(dashboard)/charging/page.tsx`, `src/app/api/vehicles/[vehicleId]/charging-history/route.ts`, `src/lib/tesla/charging-history.ts`, `src/components/charging/ChargingStatus.tsx`.

**Dependencies:** Supabase, Tesla Fleet API (live).

---

## 5. Commands (remote Tesla control)

**What:** Remote commands: lock/unlock, climate on/off + temp, honk, flash, charge limit/amps, start/stop charging, charge port open/close, vent/close windows, sentry on/off, remote start, schedule charging/departure, precondition max. Every command is gated on `BrandCapabilities`.

**How to use:** UI `/commands` (and `CommandPanel` on the dashboard). API: `POST /api/vehicles/[vehicleId]/commands` (UUID validate → rate limit → auth → ownership → capability check → live `sendVehicleCommand` or mock `applyCommand`).

**Key files:** `src/app/api/vehicles/[vehicleId]/commands/route.ts`, `src/lib/brands/tesla/command-map.ts`, `src/lib/brands/command-map.ts`, `src/lib/mock/engine.ts`, `src/components/vehicle/CommandPanel.tsx`, `src/hooks/useVehicleCommand.ts`.

**Dependencies:** Tesla Fleet API (live, needs VCP proxy for post-2021 cars), mock engine (default). Adding a command: see the checklist in `CLAUDE.md`.

---

## 6. Costs & OCR

**What:** Upload or email energy bills / charger receipts. Claude Vision extracts provider, period, kWh, cost, and per-field confidence. Costs are converted to RON (BNR), attributed to a vehicle (home bill share vs public-receipt session match), and aggregated into cost-per-km and a petrol comparison.

**How to use:** UI `/costs` (`CostDashboard` + `IngestCard`). API:
- `POST /api/documents` — file upload (10 MB max; processes in background via `after()`); `GET /api/documents` lists with signed URLs.
- `GET/DELETE /api/documents/[documentId]`.
- `POST /api/documents/recover` — claim unmatched documents.
- `GET /api/costs` — aggregation (total, home/public split, cost/km, petrol comparison, monthly trend); `GET /api/costs/export` — CSV.

**Key files:** `src/lib/ai/document-parser.ts`, `src/lib/ai/prompts/document-extraction.ts`, `src/lib/costs/processor.ts`, `src/lib/costs/attribution.ts`, `src/lib/costs/session-matcher.ts`, `src/lib/external/bnr/client.ts`, `src/app/api/costs/route.ts`.

**Dependencies:** Anthropic Vision, Supabase Storage, BNR exchange-rate XML.

**Status:** Fully implemented. Confidence below `0.7` flags `needs_review`. Constants `PETROL_PRICE_RON = 7.5`, `PETROL_L_PER_100KM = 7`.

---

## 7. Email ingestion (Cloudmailin)

**What:** Each vehicle has an auto-generated inbound email address. Cloudmailin forwards attachments via webhook; the document is stored and queued for OCR.

**How to use:** API: `POST /api/documents/inbound-email`. Authenticated by the **`x-webhook-secret` HTTP header** (env `EMAIL_WEBHOOK_SECRET`); fails closed (503) if unset. Vehicle is resolved by `+subaddress` short-ID → user email local part → sender email → subject nickname. Unmatched docs go to `unmatched/` for later recovery.

**Key files:** `src/app/api/documents/inbound-email/route.ts`, `src/lib/costs/vehicle-email.ts`, `src/lib/costs/processor.ts`.

**Dependencies:** Cloudmailin (also accepts Mailgun / SendGrid multipart), Supabase, Anthropic Vision.

**Related:** `POST /api/documents/inbound-whatsapp` — a parallel WhatsApp media ingest webhook (HMAC-secured), same processing pipeline. Configured via `WhatsAppPhonePicker` in settings.

---

## 8. Energy & tariffs

**What:** Per-user electricity tariff provider; computes the cheapest contiguous charging window ("smart charge") and a daily price curve.

**How to use:** UI `/energy` (`SmartChargeCard`, `PriceCurveChart`); provider picker in `/settings`. API: `GET /api/tariffs/prices` (resolves user provider, builds forecast + recommendation), `GET/POST /api/tariffs/settings` (read/set active provider).

**Key files:** `src/lib/external/tariffs/recommend.ts` (`findCheapestWindow`, `buildForecast`), `src/lib/external/tariffs/registry.ts`, `src/lib/external/tariffs/providers/*`, `src/components/energy/*`.

**Dependencies:** Tibber GraphQL (live, optional `TIBBER_TOKEN`). All other providers (Octopus, aWATTar, Electrica, E.ON RO, Enel RO, Hidroelectrica) are **mock price curves**.

---

## 9. Charging map

**What:** Full-screen AmpWhere-style station map. The page fills the entire viewport under the top bar with no padding or scrollable page layout. Station pins show power labels (e.g. "50kW", "250kW") directly on the pin as pill-shaped divIcons. Tapping a pin opens a `ChargerDetailSheet` bottom sheet (glassmorphism, `animate-slide-up`) showing power, connector count, connector type chips, and address. A floating filter bar at the top of the map lets users filter by minimum power and connector type. A floating station count is shown at the bottom-left.

**How to use:** UI `/charging-map`. API: `GET /api/chargers/nearby?lat=&lng=&radius=[&minKw=][&connector=]` returns `Charger[]` from PostGIS.

**Station aggregation:** `src/lib/external/charging-networks/live-stations.ts` — `fetchLiveStations(lat, lng, radius, max)` runs `Promise.allSettled([fetchOcmStations, fetchOverpassStations])`, merges results, de-dupes by `lat.toFixed(4),lng.toFixed(4)`, preserves richer power/connector data on conflicts. OCM honours `OPEN_CHARGE_MAP_API_KEY` env var. Overpass POST to `overpass-api.de`, no key needed. `AbortSignal.timeout(22000)`.

**Full-screen layout:** Root div uses `absolute inset-0 overflow-hidden` to fill the `<main>` (which has `position: relative`). `StationMap` fills 100% height/width. Filter bar is `absolute left-3 right-3 top-3 z-[1000]`. Station count is `absolute bottom-3 left-3 z-[1000]`. Bottom sheet uses `fixed bottom-0` (same pattern as `StationDetailSheet` in trip planner).

**Labeled pins:** `makeIcon(likelyOperational, selected, powerKw)` renders an SVG-based `L.divIcon` (inline `<svg>` with a rounded rect + text element) with power text ("50kW", "250kW", "1MW"). SVG is used instead of HTML `<div>` because Leaflet's CSS isolation prevents inline styles from rendering on div-based icons. Icon cache key includes the rounded power label to avoid per-marker re-allocation while bounding cache size to the number of distinct power values.

**Filter bar layout:** Two stacked compact rows (power row / connector row), each in its own `rounded-2xl` pill with `overflow-x-auto scrollbar-none`. No group labels ("Putere:", "Connector:") — chips are self-labelled. Replaces the previous single-row layout which overflowed on narrow screens.

**i18n keys in all 5 locales:** `chargingMap.connectors_label`, `chargingMap.stations_count` (added), plus all existing keys.

**User location:** A `LocateFixed` button floats inside the map (bottom-right, above Leaflet zoom controls). On page load, a silent auto-locate (3s timeout) centres the map on the user without showing an error on denial. Errors shown via `sonner` toast.

**Escape to close:** `ChargerDetailSheet` and `StationDetailSheet` listen for the `Escape` key (via `useEffect` keydown) and call `onClose` when the sheet is open. On desktop the sheets render as side cards (`md:max-w-md md:right-6`) rather than full-width bottom sheets.

**Key files:** `src/components/charging-map/StationMap.tsx`, `src/components/charging-map/ChargerDetailSheet.tsx`, `src/components/trip/StationDetailSheet.tsx`, `src/app/(dashboard)/charging-map/charging-map-client.tsx`.

**Dependencies:** Leaflet/react-leaflet, sonner, OpenChargeMap API (optional key), Overpass/OpenStreetMap (free).

---

## 9a. Full-country bulk imports (scheduled)

**What:** Daily scheduled ingest of all EV chargers for six covered countries (ro, de, fr, at, nl, hu). Replaces the old city-box warm cron. Each country is fetched from its official open-data source (IRVE for FR, BNetzA for DE, Austria ArcGIS for AT, NDW for NL) plus OCM (incremental, `modifiedsince` 7 days ago) in parallel. Results are deduped cell-by-cell over a 1°×1° grid (bounded memory) and persisted via `persistClusters`. After a successful run the country is marked bulk-fresh for 48h — map reads skip lazy tile ingest for fresh countries.

**How to use:** `GET /api/internal/warm?country=<cc>` (Bearer `CRON_SECRET` or `x-webhook-secret`). Vercel crons fire automatically: 02:00 ro, 02:30 hu, 03:00 at, 03:30 nl, 04:00 de, 04:30 fr (UTC).

**Key files:** `src/lib/chargers/ingest/bulk.ts` (orchestrator), `src/lib/chargers/ingest/irve.ts` (`fetchCountryFr`), `src/lib/chargers/ingest/bnetza.ts` (`fetchCountryDe`), `src/lib/chargers/ingest/austria.ts` (`fetchCountryAt`), `src/lib/chargers/ingest/ndw.ts` (`fetchCountryNl`), `src/lib/chargers/ingest/ocm.ts` (`fetchCountryOcm`), `src/lib/chargers/countries.ts` (bounds + `isBulkCountry`), `src/app/api/internal/warm/route.ts`, `vercel.json`.

**Dependencies:** Supabase admin client (`ingest_runs` table), `persistClusters` + `markCountryFresh` from `repository.ts`, official open-data APIs (no auth required except optional `OPEN_CHARGE_MAP_API_KEY`).

---

## 10. Trip planner

**What:** ABRP-style planner: routes origin → destination, inserts charging stops when range (weather-derated) runs low, and shows cost + petrol comparison. Uses a 10% safety reserve and 80% default charge target.

**How to use:** UI `/trip` (`GeocodingSearch`, `TripMap`, `TripPlanResult`, `StopCard`, `CostSummary`, `TripComparison`). API: `POST /api/trip-plan` (vehicle/origin/SOC/destination → `planTrip`), `GET /api/geocode` (Nominatim search, edge runtime).

**Address search (geocoding):** `GET /api/geocode?q=` proxies Nominatim + Photon for the "From"/"To" typeahead. Quota is **600 req/h per user** — sized for a debounced typeahead. Nominatim is tried first (forwards `Accept-Language` so Romanian/German city names resolve correctly, up to 6 results). When Nominatim returns empty (e.g. partial block addresses like "Bloc C4", business names, street fragments), the request falls through to **Photon** (`photon.komoot.io`) which has better fuzzy/partial matching for European addresses. Both sources are auth-gated; returns `{ results: [] }` on any upstream error.

**Charging station corridor (Balkan):** The static `STATIONS` dataset covers the full Bucharest→Bulgaria→Greece corridor (via Giurgiu/Ruse/A2 *and* via Serbia/Belgrade/Niš): Ruse (BG), Beli Izvor (BG A3), Pleven (BG E79), Lovech (BG A3), Stara Zagora (BG A1), Blagoevgrad (BG A3, Sofia→GR), Sandanski (BG E79), Kavala (GR, Thasos ferry gateway), Xanthi (GR E90). The station search radius was widened from 80km to 100km to bridge sparse Balkan segments.

**Real-road station search:** The planner now samples charging-stop search points along the **actual OSRM polyline** (not a great-circle straight line). `pointAlongRoute()` in `planner.ts` walks polyline segments accumulating haversine distance to find the exact lat/lng at `targetKm`. Falls back to linear interpolation only when OSRM itself fell back. This was the root cause of "route infeasible" on mountain-crossing trips (Cluj→Roman).

**Corridor stations:** `src/lib/external/routing/corridor-stations.ts` — `fetchCorridorStations(polyline, origin, destination)` computes a bounding box around the route (padded 0.15°) and queries Overpass for all `amenity=charging_station` nodes/ways. Prefers DC fast chargers (≥40 kW), returns up to 400 stations. These are merged (by id) with the static `STATIONS` set before planning. Falls back to `[]` silently on any error.

**Route through stations:** After charging stops are chosen, the planner runs a **second OSRM pass** through `[origin, …stops, destination]` (`computeOsrmRouteVia`) so the displayed polyline actually passes through each station and the total distance/driving time reflect the detours. `CostSummary` shows driving time, charging time, and charging cost (with petrol comparison).

**Route variants:** `planTripVariants()` plans across **alternative roads** (`computeOsrmAlternatives`, up to 2) × **charging strategies** (`fastest` = top up ~70%, more frequent shorter stops; `balanced` = charge ~95%, fewer stops). Corridor stations are fetched once and shared. Results are deduped (by stop-count + total-time signature), sorted fastest-first, capped at 4, and returned as `variants[]` (plus `plan` = the recommended first variant). The UI shows selectable chips that compare each variant **ABRP-style**: total time, the 🚗 drive vs ⚡ charge split, stops, and €. i18n: `trip.variant_fastest`, `trip.variant_balanced`. Route handler has `maxDuration = 30`.

**Alternative roads on the map (`/map?mode=plan`):** `map-client.tsx` builds `RouteLine[]` by deduping `variants[]` on `roadIndex` (one line per physical road, first/fastest variant's polyline) and passes `routes` + `onRouteSelect` to `TripMap`. Inactive roads draw as tappable dashed grey lines, the active road as a solid purple line on top (`TripMap.tsx`). Tapping a grey road calls `setActiveVariant` for that road's first variant; strategy stays on the existing chip row. Falls back to the single active polyline when there is only one unique road. Spec: `docs/superpowers/specs/2026-06-15-alternative-routes-on-map-design.md`.

**ABRP/Waze-grade upgrades:**
- **Live-traffic routing (TomTom):** `providers/tomtom-router.ts` — `computeTomTomAlternatives` / `computeTomTomRouteVia` use the TomTom Routing API (key: `TOMTOM_API_KEY`) for traffic-aware ETAs and genuine alternatives. `computeRouteAlternatives` prefers TomTom → ORS → OSRM; re-routing through stops is traffic-aware via `computeRouteVia`. `TripPlan.trafficDelayMinutes` carries the included delay; `CostSummary` shows "incl. N min traffic" (i18n `trip.traffic_delay`, all 5 locales).
- **Real charge curves:** `charge-curve.ts` — SoC-dependent DC curve integrated per stop (`chargeMinutes`) replaces the flat 0.75× average; a slow station acts as a flat power cap. Accurate stop times. Unit-tested in `__tests__/charge-curve.test.ts`.
- **Comprehensive corridor coverage:** `fetchCorridorStations` now queries the PostGIS platform **and** a direct OCM corridor query in parallel and merges them (dedupe ~60m), non-blocking — so the planner sees the same density as the station map. `chargerToStation` maps availability → `isOperational` for the reliability badge.
- **Corridor stations on the trip map:** `TripMap` renders all nearby chargers (from `GET /api/chargers` for the route bbox) as subtle context dots under the route + numbered stops, on CARTO Voyager tiles — visually consistent with the station map. `trip-client.tsx` fetches them via TanStack Query keyed on the rounded route bbox.

**Use my location (origin):** The "From" field has a `LocateFixed` icon button on the right. On click it calls `navigator.geolocation`, then reverse-geocodes via Nominatim (`/reverse`) to get a readable address, and sets that as the origin. Spinner shown while locating. Errors shown via `sonner` toast. i18n keys: `trip.use_my_location`, `trip.locating`.

**Collapsible plan panel:** After route calculation the results panel slides up from the bottom (max 45 dvh). The handle bar is rendered **outside** the collapsible content area (separate from the framer-motion height-animated `<motion.div>`) so it is always visible regardless of scroll position. Tapping the handle collapses/expands via a spring animation on the content height. Collapsing resets to a slim handle showing origin→destination + distance/time; tapping re-expands. i18n keys: `trip.see_map`, `trip.see_plan`. The panel height is animated to `"auto"` so it shrinks to content size — `maxHeight: calc(45dvh - 2.5rem)` caps it and `overflow-y: auto` scrolls when content overflows. The root element uses `absolute inset-0 overflow-hidden` for reliable full-screen layout.

**Edit mode hides results panel:** The results panel is only rendered when `formCollapsed === true`. When the user taps "← Edit" the form expands (`setFormCollapsed(false)`) and the results panel animates out via `AnimatePresence`. Re-submitting the plan calls `setFormCollapsed(true)` which brings the results panel back. This prevents the form and results overlapping on screen.

**Balkan / SEE corridor stations:** The static `STATIONS` dataset (`src/lib/external/charging-networks/stations.ts`) now includes 9 real-world stations covering the Cluj→Greece corridor via Serbia and Bulgaria: IONITY Belgrade, Niš, Sofia, Plovdiv, Thessaloniki, Larissa, Lamia + Tesla SC Sofia and Thessaloniki. This allows long-haul Balkan routes (e.g. Cluj → Athens, ~1700 km) to be planned end-to-end without "no stations found" gaps. `fetchCorridorStationsOverpass` also skips Overpass for bboxes >5°×8° (these always hit the 20s timeout and returned nothing).

**Share to Tesla + preconditioning marks:** Each charging stop with a DC fast
charger (≥50 kW) shows a battery-preconditioning badge on its `StopCard` —
"Auto-preconditioning" (blue) for Superchargers (Tesla warms the pack
automatically when navigating), "Precondition battery" (amber) for other fast
networks (manual recommendation). When the planned vehicle is a Tesla and the
route is feasible, a **"Send to Tesla"** button appears under the cost summary;
it POSTs the new `share_navigation` command (live Teslas receive a real nav
request; mock Teslas accept it as a demo no-op success, like every other
command). The command follows the standard chain (`CommandName` →
`CommandCapabilities.shareNavigation` → `COMMAND_CAP_MAP` → `TESLA_COMMAND_MAP`
→ `TeslaCommand "navigation_gps_request"` → tesla profile → mock engine no-op +
`VALID_COMMANDS`). `navigation_gps_request` is a single-target command, so
`buildBody` sends the **next** waypoint (first stop, or the destination if
stops-free) — the driver navigates stop-by-stop. Waypoint parsing uses a
`toWaypoint` type guard (no unchecked casts; NaN coords rejected). Helpers
`needsPreconditioning(maxKw)` / `isSuperchargerNetwork(networkId)` are exported
from `StopCard.tsx`. i18n: `trip.share_to_tesla`, `trip.share_success`,
`trip.share_error`, `trip.precondition_auto`, `trip.precondition_manual`.

**Arrival SOC target:** A second slider in the Options panel (`trip.arrival_soc`) lets the user specify the minimum battery % to arrive with (0–30%, step 5, default 10%). Value is sent as `arrivalSocPct` in the `POST /api/trip-plan` body.

**Semantic variant badges:** Each variant chip gets an auto-computed label: "Fastest" (accent, lowest `totalMinutes`), "Fewest stops" (green, lowest stop count), or "Cheapest" (yellow, lowest `tripEnergyCostEur`). Only one badge per chip; priority is fastest > fewest-stops > cheapest. Implemented in `getVariantLabel()` in `trip-client.tsx`. i18n: `trip.variant.fastest`, `trip.variant.fewest_stops`, `trip.variant.cheapest`.

**Recent destinations:** Up to 5 recent destinations are persisted in `localStorage["flux_recent_destinations"]` (LIFO). They appear as a dropdown under the destination input when the input is focused and empty. Click a recent to set it as destination; the × button removes individual entries; "Clear" removes all. Helper functions `getRecentDestinations()`, `addRecentDestination()`, `removeRecentDestination()` are defined in `trip-client.tsx`. i18n: `trip.recents`, `trip.clear_recents`, `trip.no_recents`.

**Enter/Escape key on GeocodingSearch:** `onKeyDown` handler on the geocoding input: Enter selects the first result when the dropdown is open; Escape closes the dropdown. Implemented in `GeocodingSearch.tsx`.

**Tap a charging stop on the map:** Clicking a gold stop marker on `TripMap` opens `StationDetailSheet` — a glass bottom sheet (z-[500], slide-up animation, tap-backdrop to dismiss) showing the station name + network badge (Tesla red / IONITY purple / other blue), a 2×2 grid (power kW, charging minutes, arrive SoC %, depart SoC %) plus energy added and est. cost. The map now passes each stop's full `ChargingStop` via `TripMap`'s `onStationSelect` callback; `trip-client.tsx` holds `selectedStop` state. Key files: `src/components/trip/StationDetailSheet.tsx` (new), `src/components/trip/TripMap.tsx`, `.animate-slide-up` keyframe in `globals.css`. i18n: `trip.station.*`.

**User-configurable petrol comparison:** The petrol-vs-EV cost comparison in `CostSummary` previously used hardcoded constants (8 L/100km, €1.65/L). The user can now set their own former petrol car's consumption and local fuel price via two small inline number inputs inside the expanded "How much would petrol cost?" panel. Values persist in `localStorage["flux_fuel_comparison"]` as `{ lPer100km, priceEurL }` (same pattern as recent destinations — no DB, no API). `petrolCostEur = (distanceKm/100) * lPer100km * priceEurL` and `savingsEur` recompute live. Helpers `getFuelComparison()` / `setFuelComparison()` validate positive numbers and fall back to defaults. Key files: `src/lib/fuel-comparison.ts` (new), `src/components/trip/CostSummary.tsx`. i18n: `trip.fuel.*` (`consumption`, `price`, `per_100km`, `per_liter`, `edit`).

**DB-primary corridor sourcing (Phase A):** `fetchCorridorStations` now sources stops exclusively from the PostGIS charger DB (no static list, no Overpass). Corridor bboxes are sampled per-segment (`corridorSampleBoxes`, up to 16 boxes), each queried independently via `findInBBox`. OCM live fallback fires only for segments whose bbox is not inside a bulk-imported country (`bulkCountryContaining` from `src/lib/chargers/countries.ts`) — so Balkan/international routes (Serbia, Bulgaria, Greece) still get coverage. The static `STATIONS` array in `stations.ts` is no longer imported or used; `route.ts` passes `stations: []`. `chargerToStation` faithfully maps `Charger.connectors` to `PlugType[]` (ccs2→CCS, chademo→CHAdeMO, type2→Type2, tesla→Tesla) and carries through `availability`, `confidence`, and real `pricing.perKwh`.

**Connector-aware filtering and scoring:** Before candidate selection, `filterUsableStations` removes offline stations, stations with confidence < 0.5, and stations incompatible with the vehicle's `supportedConnectors` (unknown plug type always passes). `scoreStation` replaces the old power-desc sort with a weighted score: effective kW (`min(station, vehicle)`) as the dominant positive term, detour distance and price as penalties, stall count bonus (≥4), stale availability penalty. Stop cost still uses the station's real `priceEurKwh` when available. Zero-station gaps produce a `warning` naming the km range ("No charging coverage between X km and Y km").

**Vehicle connector support:** `ModelSpec` now has `supportedConnectors: ConnectorType[]`. All Tesla models: `["ccs2", "tesla"]`.

**Key files:** `src/app/api/trip-plan/route.ts`, `src/lib/external/routing/planner.ts`, `src/lib/external/routing/corridor-stations.ts`, `src/lib/external/routing/providers/osrm-router.ts`, `src/app/api/geocode/route.ts`, `src/components/trip/GeocodingSearch.tsx`, `src/components/trip/StopCard.tsx`, `src/app/(dashboard)/trip/trip-client.tsx`, `src/lib/brands/models.ts` (supportedConnectors), `src/lib/brands/tesla/command-map.ts` (share_navigation), `src/app/api/vehicles/[vehicleId]/commands/route.ts`.

**Dependencies:** OSRM (`router.project-osrm.org`, 5s timeout with haversine×1.25 fallback), OCM (non-bulk segments only), Nominatim (geocoding + reverse geocoding), PostGIS charger DB (primary), Leaflet, sonner, mock weather derating, model specs (`src/lib/brands/models.ts`).

---

## 10b. Unified Map Screen (`/map`)

**What:** A single full-screen map experience that unifies the trip planner (`/trip`) and charging-station browser (`/charging-map`) into one sheet-based UI. Inspired by ABRP / Google Maps. Available at `/map` with an optional `?mode=plan` or `?mode=explore` query param.

**How to use:** UI `/map`. Tap the "Hartă" tab in the bottom nav (mobile) or the "Map" link in the sidebar Planning section. Drag the bottom sheet up to reveal: Explore mode — filter pills + station list; Plan mode — origin/destination, SOC sliders, vehicle picker, Plan button, and trip results.

**Architecture:**
- `src/app/(dashboard)/map/page.tsx` — server component: auth check + metadata only.
- `src/app/(dashboard)/map/map-client.tsx` — unified client: full-screen map layer + floating filter overlay + Framer Motion draggable bottom sheet with 3 snap points (PEEK=96px, HALF=45vh, FULL=88vh). Explore and Plan modes share state and switch via tab row in the sheet header.
- After computing a plan the sheet auto-collapses to a taller peek (158px) with a compact summary strip (time · km · stops · cost) so the route stays visible on the map; tapping the strip toggles full details (Google Maps pattern). Landing on `?mode=plan` opens the sheet at half so the form is immediately usable.
- Reuses `TripMap`, `StationMap`, `ChargerDetailSheet`, `StationDetailSheet`, `GeocodingSearch`, `StopCard`, `CostSummary` — no logic is duplicated.
- Station data via existing `GET /api/chargers` (same query as `/charging-map`). Trip planning via existing `POST /api/trip-plan`.

**Navigation:**
- BottomNav: "Hartă" tab replaces the old "Trip" tab (key `nav.mobile.map`).
- Sidebar: "Map" link added to the Planning section (key `nav.map`).

**i18n keys added (all 5 locales):** `nav.map`, `nav.mobile.map`, `map.title`, `map.tab_explore`, `map.tab_plan`, `map.explore_hint`, `map.plan_hint`, `map.no_stations`, `map.drag_to_expand`.

**Key files:** `src/app/(dashboard)/map/page.tsx`, `src/app/(dashboard)/map/map-client.tsx`, `src/components/layout/BottomNav.tsx`, `src/components/layout/Sidebar.tsx`.

**Dependencies:** Framer Motion (`useAnimation`, `motion.div`), react-leaflet, TanStack Query, next-intl.

---

## 11. Settings

**What:** Preferences (locale, currency), home location, tariff provider, WhatsApp phone, billing controls, and account danger zone (export / delete). Uses a client-driven data loading pattern for crash resilience — the server component only does an auth check, then delegates all data fetching to TanStack Query in the client component.

**Architecture:** `page.tsx` (server) → auth check only → `<SettingsClient>` (client) fetches all data via TanStack Query:
- `GET /api/vehicles?include_inactive=true` — all vehicles (active + inactive, includes `scenarioId` for mock vehicles)
- `GET /api/tariffs/settings` — active tariff provider + provider list
- `GET /api/me/capabilities` — subscription tier (`hasProSubscription`)

While queries are loading, 4 `animate-pulse` skeleton blocks are shown. If any individual API call fails, defaults are used — the page renders rather than crashing.

**How to use:** UI `/settings`. API: `GET/PATCH /api/me/preferences`, `GET /api/user/export` (GDPR export), `DELETE /api/user/delete` (account deletion), `GET/PUT /api/tariffs/settings`.

**Key files:**
- `src/app/(dashboard)/settings/page.tsx` — minimal server component (auth check + redirect only)
- `src/app/(dashboard)/settings/settings-client.tsx` — full client component with TanStack Query data loading and all sections
- `src/app/(dashboard)/settings/danger-zone.tsx`, `src/components/settings/*`

**Dependencies:** TanStack Query, Supabase (via API routes), next-intl. `/about-data` is a companion read-only transparency page.

---

## 12. Internationalization (i18n)

**What:** Full UI translation across 5 locales — `ro` (default), `en`, `de`, `fr`, `hu` — via next-intl. Locale is stored in the `flux_locale` cookie.

**How to use:** `useTranslations("namespace")` (client) / `getTranslations` (server). Locale switching via `LocalePicker` in settings.

**Key files:** `src/lib/i18n/config.ts`, `src/lib/i18n/locales/{en,ro,de,fr,hu}.json`.

**Rule:** Every visible string must exist in all 5 locale files.

---

## 13. Billing / subscription

**What:** Stripe-backed Free/Pro tiers. Free tier limits: 1 vehicle, 3 documents/month. Pro lifts both. Tier is read from `profiles.subscription_tier`.

**How to use:** UI in `/settings` (`UpgradeButton`, `ManageSubscriptionButton`). API:
- `POST /api/billing/checkout` — creates a Stripe Checkout session (`pro` / `pro_annual`).
- `POST /api/billing/portal` — Stripe customer portal.
- `POST /api/billing/webhook` — Stripe webhook (signature-verified, idempotent via `stripe_events` table).

**Key files:** `src/lib/stripe.ts` (lazy client), `src/lib/subscription.ts` (`getSubscriptionTier`, `canAddVehicle`, `canUploadDocument`), `src/app/api/billing/*`.

**Dependencies:** Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`).

**Status:** Functional end-to-end (checkout, portal, webhook with idempotency, and tier-based gating enforced in `canAddVehicle`/`canUploadDocument`). Requires the Stripe env vars and price IDs to be configured; routes fail with 503 if price/webhook secret is missing.

---

## 14. Design System — Mobile-First Dark Redesign

**What:** Premium dark mode design system with richer color tokens (deep navy-black background, electric-blue primary), glassmorphism card pattern, and shared animated components. Targets the 90% mobile user base.

**How to use:**
- Dark tokens apply automatically when `.dark` class is present (next-themes).
- `<GlassCard>` — animated frosted-glass card; `animate={false}` disables motion.
- `<CircularProgress value={0-100}>` — SVG ring with animated stroke for charging UI.
- `<PageWrapper>` — wraps page content with fade-up entry animation.
- `.glass-card` CSS class — apply directly when the React component is not needed.
- `BottomNav` — pill indicator (`bg-primary/15`), active icon glow (`drop-shadow`), `whileTap` spring scale, haptic feedback, scroll-to-top on re-tap.
- `SlideUpMenu` — `rounded-t-3xl`, `backdrop-blur-3xl`, stronger shadow, drag-to-dismiss.

**Key files:**
- `src/app/globals.css` — color tokens (`:root` + `.dark`) + `.glass-card` utility
- `src/components/ui/glass-card.tsx`
- `src/components/ui/circular-progress.tsx`
- `src/components/layout/page-wrapper.tsx`
- `src/components/layout/BottomNav.tsx`
- `src/lib/animations/variants.ts` — shared Framer Motion variants

**Dependencies:** Framer Motion v12 (already installed), Tailwind CSS v4.

---

## 15. Dashboard & Garage Mobile Redesign

**What:** Full mobile-first redesign of `/dashboard` and `/garage` using the new glassmorphism design system. Dashboard features a hero card with `text-7xl` SOC display, animated progress bar (green/amber/red), LIVE badge, horizontal-scrolling stat chips, 3-button quick actions, and a conditional charging overlay card. Garage shows full-width `aspect-[16/7]` vehicle cards with gradient backgrounds and vehicle silhouette SVGs, plus a dashed "Add vehicle" card.

**How to use:**
- `/dashboard?v=<vehicleId>` — hero card, stat chips row, quick actions, charging card
- `/garage` — vehicle hero cards, add-vehicle dashed card

**Key files:**
- `src/app/(dashboard)/dashboard/dashboard-client.tsx` — hero card, stat chips, quick actions, charging overlay
- `src/app/(dashboard)/garage/garage-client.tsx` — full-width vehicle cards with glassmorphism
- `src/lib/i18n/locales/*.json` — added `dashboard.charging_active`, `dashboard.charging_remaining`, `dashboard.chip_*`, `dashboard.action_charge`, `garage.vehicles_count_*`, `garage.mock_label`, `garage.tap_to_open` to all 5 locales

**Dependencies:** `GlassCard`, `CircularProgress`, `PageWrapper` (design system), Framer Motion, `useVehicle`, `useVehicles`, `useVehicleCommand`.

---

## 16. Costs Page — Mobile Redesign

**What:** Mobile-first redesign of the `/costs` screen. Replaces the desktop-oriented grid layout with three mobile-optimised sections: (1) a horizontally-scrollable KPI chip row (6 chips: total spent, total kWh, home %, cost/km, Wh/km, fuel saving), (2) a gradient bar chart for the monthly trend, and (3) a timeline-style document list where each entry has a coloured dot+line indicating its status. A FAB (`+`) fixed at `bottom-24 right-4` opens the upload/ingest card inline.

**How to use:** UI `/costs?v=<vehicleId>`. No API changes. The FAB toggles the `IngestCard` visibility; when no documents exist the card is always shown. Status colours: done = green, needs_review = amber, error = red.

**Key files:**
- `src/app/(dashboard)/costs/costs-client.tsx` — full client component (KPI chips, chart, timeline, FAB)
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — new keys: `kpi_total_lei`, `kpi_total_kwh`, `kpi_home_pct`, `kpi_fuel_saving`, `kpi_cost_per_km_blended`, `kpi_wh_per_km_label`, `docs_heading`, `fab_label`, and others

**Dependencies:** Framer Motion v12, `PageWrapper`, `GlassCard` CSS utility, `DocumentStatusCard`, `IngestCard`, `useCosts`, `useDocuments`.

---

## 17. Charging Page — Mobile Redesign

**What:** Full mobile-first redesign of `/charging` using the glassmorphism design system. Replaces the plain card layout with: (1) an animated `CircularProgress` ring always visible, reflecting charge state with green/amber/grey color; center shows current % + kW + time remaining when active; (2) a glass-card charge limit slider with save button; (3) an iOS-style scheduled charging card with toggle + time picker; (4) staggered glass history cards — each with date, duration, kWh, cost, home/public icon + location label; empty state with centered icon.

**How to use:** `/charging?v=<vehicleId>`. No API changes. The server passes the 20 most recent `charging_sessions` rows (started_at, ended_at, energy_added_kwh, cost_eur, location_name). Live vehicle state (ring, slider) fetched client-side via `useVehicle`.

**Key files:**
- `src/app/(dashboard)/charging/charging-client.tsx` — full redesigned client component
- `src/app/(dashboard)/charging/page.tsx` — server component, passes `ChargingSessionRow[]`
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — added keys: `ring_status_*`, `ring_target`, `ring_power`, `ring_time_remaining`, `history_duration`, `history_kwh`, `history_cost`, `history_home`, `history_public`

**Dependencies:** `CircularProgress`, `GlassCard`, `PageWrapper` (design system), `staggerContainer`/`fadeInUp`/`tapShrink` from `variants.ts`, Framer Motion v12, `useVehicle`, `useVehicleCommand`, `useChargingHistorySync`.

---

## 18. Settings + Auth Mobile Redesign

**What:** Mobile-first redesign of `/settings` and the auth pages (`/login`, `/register`) following the glassmorphism design system.

- **Settings** (`/settings`): iOS-style list layout wrapped in `PageWrapper`. Each section uses a `GlassCard` with `divide-y divide-white/5` rows. Every row has a `min-h-[52px]` flex layout with a colored rounded-square icon (`size-8 rounded-lg`), a label, and an optional value/control on the right. Sections: Account, Preferences, Location, Vehicles, Energy Tariff, Subscription, Danger Zone. The Danger Zone row uses `bg-destructive/20` icon background and `text-destructive` text.

- **Auth** (`/login`, `/register`): Full-screen dark background with an electric glow (radial blurs via `blur-3xl`). Centered brand logo with tagline above a `.glass-card` form container that slides up via Framer Motion. Inputs use `bg-white/5 border border-white/10 rounded-xl py-3 px-4` styling. Submit button is full-width with `rounded-xl bg-primary`. All strings use `t()` from `auth.*` i18n namespace. `LoginForm` is updated to use `useTranslations("auth")` throughout.

**How to use:**
- `/settings` — requires authenticated session
- `/login`, `/register` — public auth pages

**Key files:**
- `src/app/(dashboard)/settings/page.tsx` — iOS-style settings layout
- `src/app/(auth)/layout.tsx` — dark full-screen auth shell with glow effects and brand header
- `src/app/(auth)/login/page.tsx` — glass card login form
- `src/app/(auth)/register/page.tsx` — glass card register form
- `src/components/auth/LoginForm.tsx` — updated inputs + i18n via `useTranslations("auth")`

**Dependencies:** `GlassCard`, `PageWrapper` (design system), `next-intl`, Framer Motion v12.

---

## 19. Energy & Commands — Mobile-First Redesign

**What:** Full visual redesign of `/energy` and `/commands` for mobile-first usage (glassmorphism cards, Framer Motion animations, recharts AreaChart, 2-column command grid).

**Energy page (`/energy`):**
- **Smart Charge hero card** — `SmartChargeCard` is now the top, most prominent element; large glass card with "Recommended ✓" badge, optimal start time, savings in €, and a full-width `Schedule` CTA button with `whileTap` press feedback. Shows a muted placeholder when no recommendation is available.
- **Price curve chart** — `PriceCurveChart` rebuilt with recharts `AreaChart`; blue gradient fill, vertical dashed `ReferenceLine` at the current hour, green stripe behind the cheapest window, glassmorphism tooltip.
- **Collapsible Departure & Preconditioning card** — `ChevronDown/Up` toggle with `AnimatePresence` height animation; shows `DepartureCard` for the first vehicle.
- `PageWrapper` wraps all content; each section fades up via `cardVariants`.

**Commands page (`/commands`):**
- `CommandPanel` redesigned with a 2-column `grid grid-cols-2 gap-3` layout.
- Each button is a `motion.button` glass card (`min-h-[80px]`, icon `size-8`, label `text-sm`), `whileTap: {scale:0.95}`.
- **Active state**: `border-primary/60 shadow-primary/20 shadow-lg`.
- **Sending state**: `Loader2` spinner replaces the icon, button `opacity-60 pointer-events-none`.
- Success/error feedback via `sonner` toast.

**How to use:** Navigate to `/energy` or `/commands` from the bottom nav or sidebar.

**Key files:**
- `src/app/(dashboard)/energy/energy-client.tsx`
- `src/app/(dashboard)/commands/commands-client.tsx`
- `src/components/energy/PriceCurveChart.tsx`
- `src/components/energy/SmartChargeCard.tsx`
- `src/components/vehicle/CommandPanel.tsx`

**Dependencies:** recharts, Framer Motion v12, sonner.

---

## 20. Capability Context Endpoint

**What it does:** Returns a `CapabilityContext` object (`hasVehicle`, `hasLiveVehicle`, `hasTariff`, `hasCommandsReady`, `hasProSubscription`) so client components can gate UI features in a single fetch without exposing subscription details across every query. Unauthenticated callers receive all-false defaults rather than a 401.
**Entry point:** `GET /api/me/capabilities`
**Key files:** `src/app/api/me/capabilities/route.ts`, `src/lib/capabilities.ts`
**Dependencies:** Supabase (`vehicles`, `user_settings`, `profiles` tables).

---

## 21. PWA Manifest

**What it does:** Exposes a Web App Manifest so Flux can be installed as a standalone PWA (home-screen icon, splash colour `#09090b`, `start_url=/dashboard`).
**Entry point:** `GET /manifest.webmanifest` — Next.js auto-serves `src/app/manifest.ts`
**Key files:** `src/app/manifest.ts`
**Dependencies:** `public/icon-192.png`, `public/icon-512.png`.

---

## 22. Flux 2027 Design System — Energy / Costs / Charging Polish

**What it does:** Visual polish pass (Wave 3B) removing colored icon circles, enforcing `font-thin` on hero numbers, fixing button heights to `h-10 rounded-[10px]`, and softening the glass-card border from 8% to 5% opacity.
**Entry point:** UI-only — no API changes. Affects `/(dashboard)/charging`, `/(dashboard)/energy`, `/(dashboard)/costs`.
**Key files:** `src/components/energy/SmartChargeCard.tsx`, `src/components/costs/IngestCard.tsx`, `src/components/costs/DocumentStatusCard.tsx`, `src/app/(dashboard)/charging/charging-client.tsx`, `src/app/(dashboard)/energy/energy-client.tsx`, `src/app/(dashboard)/costs/costs-client.tsx`, `src/app/globals.css`.
**Dependencies:** GlassCard (`@/components/ui/glass-card`), Framer Motion, Tailwind CSS v4.

---

## 22. Pricing Page

**What it does:** Public marketing page comparing Free (€0) and Pro (€4.99/mo or €39/yr) tiers with feature lists. Renders `UpgradeButton` for authenticated free-tier users and a `/login` redirect for unauthenticated visitors.
**Entry point:** `src/app/pricing/page.tsx`
**Key files:** `src/app/pricing/page.tsx`, `src/components/billing/UpgradeButton.tsx`, `src/lib/subscription.ts`
**Dependencies:** Supabase (reads `profiles.subscription_tier`), Stripe (checkout triggered via `UpgradeButton`).

---

## 23. Landing Page & Trip Planner — Glass Polish

**What:** Mobile-first polish pass on the `/` landing page and `/trip` trip planner, following the v2 UX redesign spec (sections 3.7 and 3.11).

**Landing page (`/`):**
- Hero section split into `<LandingHero>` (client) — staggered Framer Motion `fadeInUp` animations, badge pill, `text-4xl` on mobile / `text-6xl` on `lg:`, full-width CTA on mobile.
- Feature grid via `<LandingFeatures>` (client) — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, each card uses `border border-white/8 bg-white/5 backdrop-blur-sm` glass styling with stagger animation.
- CTA buttons use `bg-gradient-to-r from-primary to-primary/90`.
- Nav and footer use `border-white/8` + `backdrop-blur-xl` instead of plain `border`.

**Trip planner (`/trip`):**
- Search overlay card upgraded to `border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl`.
- Vehicle `<select>` uses `border-white/10 bg-white/5 backdrop-blur-sm`.
- Results panel upgraded to `border-white/10 bg-background/95 backdrop-blur-xl`.
- Infeasible/warning banners use `border-amber-500/30 bg-amber-500/10` glass style.
- No-stops banner uses `border-green-500/20 bg-green-500/10`.
- All hardcoded Romanian strings replaced with `useTranslations("trip")`.

**StopCard (`src/components/trip/StopCard.tsx`):**
- Container: `border border-white/8 bg-white/5 backdrop-blur-sm`.
- Network badge: pill chip `border-white/10 bg-white/5`.
- Cost label uses `text-green-400` for dark mode.

**CostSummary (`src/components/trip/CostSummary.tsx`):**
- Chips row: `border-white/8 bg-white/5` glass chips.
- Cost chip: `border-green-500/20 bg-green-500/10 text-green-400`.
- Fuel comparison panel: `border-white/8 bg-white/5 backdrop-blur-sm`.
- Fuel toggle button: adds hover `bg-white/5` for touch feedback.
- All hardcoded Romanian strings replaced with `useTranslations("trip")`.

**i18n:** Added `landing` and `trip` namespaces to all 5 locale files (en/ro/de/fr/hu). Added missing `auth` namespace to ro/de/fr/hu.

**How to use:** Visit `/` (unauthenticated) or `/trip` (dashboard).

**Key files:**
- `src/app/page.tsx` — landing page server component
- `src/components/landing/LandingHero.tsx` — animated hero client component
- `src/components/landing/LandingFeatures.tsx` — animated feature grid client component
- `src/app/(dashboard)/trip/trip-client.tsx` — trip planner client component
- `src/components/trip/StopCard.tsx` — charging stop card
- `src/components/trip/CostSummary.tsx` — trip cost summary with fuel comparison
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — `landing` + `trip` + `auth` namespaces

**Dependencies:** Framer Motion v12, `staggerContainer`/`fadeInUp` from `variants.ts`, next-intl `useTranslations`/`getTranslations`.

---

## 24. Battery State-of-Health (SoH) API

**What it does:** Returns the historical battery health time-series for a vehicle as `{ date, sohPct }[]`, queried from `battery_health_history` with ownership check.

**Entry point:** `GET /api/vehicles/[vehicleId]/battery-health`

**Key files:** `src/app/api/vehicles/[vehicleId]/battery-health/route.ts`

**Dependencies:** Supabase (`battery_health_history` table). Displayed by `BatteryHealthCard` on the dashboard.

---

## 25. Weather & Range Derating API

**What it does:** Returns mock weather conditions at the vehicle's last-known location and a `derating` object showing how weather reduces real-world range versus the ideal figure.

**Entry point:** `GET /api/vehicles/[vehicleId]/weather`

**Key files:** `src/app/api/vehicles/[vehicleId]/weather/route.ts`, `src/lib/external/weather/providers/mock-weather.ts`, `src/lib/external/weather/derating.ts`

**Dependencies:** Supabase (vehicle state for lat/lng). Weather data is mock-only; no external API key required.

**Derating model (updated 2026-06-12):** Piecewise linear calibrated against real-world EV cold-weather data: 15→0°C at −1%/°C; 0→−10°C at −1.5%/°C; below −10°C at −2%/°C (Nordic extreme). Previous flat 0.5%/°C under-reported cold losses by ~50% at −20°C.

**Known gap:** No elevation/altitude derating — mountain routes (e.g. Transfăgărășan, Alpine passes) add 15–20% consumption for 1200m elevation gain that the model does not yet account for.

---

## 26. Scenario Switcher (Demo Vehicles)

**What it does:** Lets users switch the simulated driving behaviour of a demo vehicle without re-adding it. Selecting a new scenario re-seeds `mock_vehicle_state` with fresh defaults while preserving the existing odometer reading so trip history stays consistent.

**How to use:**
- Settings → Vehicles section → select a scenario from the dropdown (only visible for mock/demo vehicles).
- API: `PATCH /api/vehicles/[vehicleId]` with body `{ "scenarioId": "road-trip" }`. Valid values: `commuter`, `weekend-errands`, `road-trip`, `vacation`. Returns `{ success: true }`.

**Key files:**
- `src/app/api/vehicles/[vehicleId]/route.ts` — PATCH handler extended to accept `scenarioId`
- `src/components/settings/ScenarioPicker.tsx` — client dropdown with `useTransition` + TanStack Query invalidation
- `src/app/(dashboard)/settings/page.tsx` — wires picker into the Vehicles section (mock vehicles only)
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — `settings.scenario.label/help` keys

**Dependencies:** `createInitialSnapshot()` (`src/lib/mock/seed.ts`), `listScenarios()` (`src/lib/mock/scenarios.ts`), `mock_vehicle_state` Supabase table.

---

## 27. PWA — Installable App

**What it does:** Makes Flux installable as a home-screen app on Android and iOS. A network-first service worker (`flux-v1` cache) pre-caches `/` and `/dashboard` on install and serves them as fallback when offline. Old caches are pruned on activate. An animated install banner (framer-motion `slideUp`) handles Android (`beforeinstallprompt`) and iOS (Share-sheet hint). iOS detection covers both classic UA string and iPadOS (MacIntel + touch). The iOS hint re-shows after 7 days; Android dismissal is permanent (localStorage key `pwa-install-dismissed`). The `beforeinstallprompt` event is captured at module scope (`use-install-prompt.ts`, exposed via `useSyncExternalStore`) so both the banner and the Settings entry can trigger install regardless of mount order.

**How to use:** On Android Chrome, a banner slides up from the bottom inviting the user to add to home screen. On iOS Safari, a hint instructs using Share → Add to Home Screen. Both can be dismissed. Additionally, **Settings → Preferences → Install app** always offers install: a button on Android (when installable), the Share-sheet hint on iOS, an "Installed" badge once running standalone, or a browser-menu hint otherwise. The canonical manifest is served by Next.js from `src/app/manifest.ts`. To test: open DevTools → Application → Manifest / Service Workers.

**Key files:**
- `public/sw.js` — network-first service worker (cache: `flux-v1`, app shell: `/`, `/dashboard`)
- `src/lib/pwa/use-install-prompt.ts` — module-scope `beforeinstallprompt` capture + `useSyncExternalStore` hook + `promptInstall()` + `isIOS`/`isStandalone` helpers
- `src/components/pwa/ServiceWorkerRegistrar.tsx` — registers the SW on mount (client-only)
- `src/components/pwa/InstallPrompt.tsx` — animated install banner (Android + iOS hint, `md:hidden`)
- `src/components/pwa/InstallAppButton.tsx` — Settings control (install button / iOS hint / installed badge)
- `src/app/(dashboard)/layout.tsx` — mounts SW registrar + banner
- `src/app/(dashboard)/settings/settings-client.tsx` — "Install app" row in Preferences
- `src/app/manifest.ts` — Web App Manifest (Next.js route handler)
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — `pwa.*` keys (`install_title`, `install_cta`, `install_dismiss`, `ios_hint`, `installed`, `unsupported_hint`) + `settings.install_app.label`

**Dependencies:** `framer-motion` (already in use). Requires HTTPS in production for SW registration.

---

## 28. Getting Started Checklist

**What it does:** Shows a dismissible "Getting Started" card above the Hero card on the dashboard for new users. Tracks four steps: (1) add a vehicle, (2) upload a receipt, (3) set home location, (4) explore the demo — the last step never auto-completes and always links to `/garage`. Shows a "{done} / {total} complete" progress counter. The card auto-hides when all 4 steps are done, or immediately when dismissed ("Got it" button). Dismissed state is persisted in `localStorage` under key `"onboarding-dismissed"`. Checklist data is resolved server-side (Supabase) and passed as props to avoid a waterfall fetch.

**How to use:** Visible automatically to new users on the dashboard. Each incomplete step is a direct link (with a ChevronRight arrow) to the relevant page. Once dismissed or all steps are complete, the card is gone until `localStorage` is cleared.

**Key files:**
- `src/components/onboarding/GettingStartedCard.tsx` — client component (dismiss + step list + progress counter + motion entrance)
- `src/app/(dashboard)/dashboard/page.tsx` — fetches checklist state server-side and passes to DashboardClient
- `src/app/(dashboard)/dashboard/dashboard-client.tsx` — renders card above HeroCard
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — `getting_started.*` keys (title, progress, dismiss, step_vehicle, step_receipt, step_home, step_explore)

**Dependencies:** Supabase (`vehicles`, `documents`, `profiles` tables), `GlassCard`, Framer Motion (`cardVariants`).

---

## 29. Dashboard Polish — Live Badge Fetch State + Pull-to-Refresh

**What it does:**
- **Live badge:** The dot in the "Live" badge pulses blue while a background refetch is in-flight (every 30 s), giving clear visual feedback that data is updating.
- **Pull-to-refresh (mobile only):** Pulling down from the top of the dashboard on touch devices triggers an immediate data refetch. Uses touch events on the `<main>` scroll container; no extra libraries.

**Key files:**
- `src/hooks/usePullToRefresh.ts` — reusable hook, queries `document.querySelector('main')`, 70px drag threshold
- `src/app/(dashboard)/dashboard/dashboard-client.tsx` — `isFetching` forwarded to `LiveBadge`; `usePullToRefresh` mounted here
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — `dashboard.pull_to_refresh/refreshing` keys

**Dependencies:** `useVehicle` hook (exposes `isFetching` + `refetch` from TanStack Query).

---

## 30. VIN Decoder — Tesla Model Variant Auto-Detection

**What it does:** Adds an optional VIN field to the Add Vehicle modal. When a user types a 17-character Tesla VIN (starting with `5YJ`), `decodeTeslaVin` parses the model (position 3), drive variant (position 4), and model year (position 9) from the VIN, then auto-fills the Model and Year dropdowns and shows a green "Detected: Model 3 Dual Motor AWD (2023)" hint inline. VIN is never sent to any API — it is purely client-side UX.

**How to use:** Open the Add Vehicle modal, type a Tesla VIN in the "VIN (optional)" field. Auto-detection fires as you type once the string is exactly 17 characters.

**Key files:**
- `src/lib/brands/tesla/vin-decoder.ts` — pure `decodeTeslaVin(vin): VinInfo | null` utility
- `src/components/onboarding/AddVehicleModal.tsx` — VIN input, `handleVinChange`, detection hint
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — `onboarding.add_vehicle.vin_label/vin_placeholder/vin_detected` keys

**Dependencies:** No new npm packages. Client-only; no API changes.

---

## 31. Vehicle Deactivation & Deletion

**What it does:** Lets users soft-delete (deactivate) or permanently delete a vehicle. Deactivation sets `is_active = false` — the vehicle disappears from all live queries but all data is preserved; it can be reactivated any time from Settings. Permanent deletion issues a hard `DELETE` with a required checkbox confirmation. Free-tier users cannot reactivate when their active-vehicle slot is full (returns 403 `free_tier_limit`).

**How to use:**
- **Garage:** tap the `⋮` (MoreVertical) button on any vehicle card → "Deactivate" → confirm dialog.
- **Settings → Vehicles:** each active vehicle row has a "Deactivate" button; a collapsible "Inactive vehicles" section below shows deactivated vehicles with "Reactivate" and "Delete permanently" actions.

**Key files:**
- `src/app/api/vehicles/[vehicleId]/route.ts` — PATCH now accepts `is_active: boolean`; reactivation guarded by `canAddVehicle`
- `src/app/api/vehicles/route.ts` — GET accepts `?include_inactive=true` to return all vehicles
- `src/components/garage/VehicleCardMenu.tsx` — DropdownMenu + AlertDialog for garage deactivate flow
- `src/app/(dashboard)/garage/garage-client.tsx` — mounts `VehicleCardMenu`, invalidates `["vehicles"]` on success
- `src/components/settings/InactiveVehiclesList.tsx` — collapsible list with reactivate + permanent delete
- `src/components/settings/DeactivateButton.tsx` — small client button used in the settings active-vehicle rows
- `src/app/(dashboard)/settings/page.tsx` — fetches all vehicles (no `is_active` filter), splits into active/inactive, passes both down
- `src/lib/i18n/locales/{en,ro,de,fr,hu}.json` — `garage.menu_deactivate/deactivate_confirm_*` and `settings.inactive_vehicles_title/reactivate/delete_*` keys

**Dependencies:** `canAddVehicle` from `src/lib/subscription.ts`; `DropdownMenu` + `AlertDialog` from shadcn/ui (already present); no new npm packages.

---

## 32. Dashboard Display Polish

**What it does:** Four display improvements to the main dashboard:

1. **Location label:** The location stat chip now shows a human-readable city name (e.g. "Prague", "Munich") instead of raw coordinates. Uses a coordinate → city mapping for all mock scenario locations. Coordinates outside the mapping fall back to `"lat, lng"` format.
2. **Defensive battery display:** The big SOC number only renders if `batteryLevel` is 0–100. Any out-of-range or corrupt value shows `—` instead of a horror number.
3. **Odometer polish:** 0 or null odometer shows `— km`; non-zero values are shown to 1 decimal place.
4. **Temperature chip icon colour:** Thermometer icon is blue below 5 °C, default/gray for 5–20 °C, and amber above 20 °C.

**How to use:** Visible automatically on `/dashboard`.

**Key files:**
- `src/app/(dashboard)/dashboard/dashboard-client.tsx` — all display logic
- `src/lib/mock/location-label.ts` — `mockLocationLabel(lat, lng)` utility

**Dependencies:** No new npm packages.

---

## 33. Charger Data Platform (PostGIS, deduped, multi-source)

**What it does:** A fast, deduplicated, confidence-scored charging-station dataset
stored in **PostGIS**, fed by **hybrid ingestion** (lazy cache-through on request
+ scheduled hot-region warm-refresh) from five open/free sources: OpenChargeMap
(global, CC BY 4.0), OpenStreetMap/Overpass (global, ODbL), **BNetzA** (Germany —
official Ladesäulenregister, ArcGIS REST, no auth, daily updates, DL-DE 2.0 ≈
CC BY), **NDW/DOT-NL** (Netherlands — OCPI GeoJSON bbox API, no auth, near-real-time,
Open Data), and **TomTom EV** (global, EV-station category search, free tier
~2,500 req/day, strong European/Romania coverage with per-connector type + rated
power — only active when `TOMTOM_API_KEY` is set). ChargePrice provides pricing
enrichment. Replaces slow per-request live aggregation with stored, queryable data.
Europe/Romania scope, global-ready.
Design: `docs/superpowers/specs/2026-06-03-charger-data-platform-design.md`.

> **Coverage note:** OpenChargeMap is the best free Romanian source but is
> **IP-rate-limited without an API key** — set `OPEN_CHARGE_MAP_API_KEY` (free) for
> full results on Vercel's shared IPs. Commercial OCPI operator feeds (as used by
> apps like AmpWhere) give denser coverage + live prices but require contracts;
> TomTom's free tier is the closest free substitute and is wired here.

**Pipeline:** `fetchAllSources(bbox)` (OCM + Overpass + BNetzA + NDW in parallel
+ ChargePrice enrich) → `clusterChargers(raws, existing)` (spatial ≤60m + fuzzy
operator/connector/name matching, merge by source priority, connector union) →
`computeConfidence` (independent-source agreement + completeness − conflict) →
`upsert_charger` RPC (geography construction server-side). Orchestrated by
`ingestArea(bbox)` in `repository.ts`; `ensureAreaFresh(bbox)` runs it only for
stale tiles (Redis freshness keys, **v2** namespace, 7-day lazy TTL).

**Dedup details that keep the map clean:**
- **Same-site force-merge:** two records within `SAME_SITE_M` (25 m) are the same
  physical point → forced match regardless of sparse/missing metadata. Without
  this, OCM's duplicate community submissions at one coordinate each fall below
  the 0.6 threshold and stack into a single spiderfied point on the map.
- **Upstream sync:** the authoritative/fresh source (OCM) overwrites
  location/name/operator/address per-field on each ingest (`preferAddress`), so a
  corrected address upstream propagates to our stored charger instead of being
  pinned to the first value.
- **Freshness only on success:** `ingestArea` marks tiles fresh **only** when the
  ingest actually persisted data — if clusters existed but every upsert failed it
  leaves the tiles stale so the next request retries (previously a wholesale
  upsert failure cached an empty area for the full TTL).
- **One-time cleanup:** migration `021` collapses coincident duplicate rows that
  earlier ingests already stored.

**Query APIs** (auth + rate-limited `chargers` bucket, Zod-validated; return
`Charger[]`):
- `GET /api/chargers/nearby?lat&lng&radius&minKw&connector&minConfidence&limit` — `ST_DWithin` + distance sort; triggers lazy ingest.
- `GET /api/chargers?bbox=minLng,minLat,maxLng,maxLat&…` — viewport query; triggers lazy ingest.
- `GET /api/chargers/search?q&country&limit` — trigram name/operator search (DB only, no ingest).
- `GET /api/chargers/[id]` — single canonical charger.

**Scheduled refresh:** `vercel.json` crons hit `GET /api/internal/warm?region=ro|eu`
(Vercel `Authorization: Bearer $CRON_SECRET`, or manual `x-webhook-secret`
with `INGEST_WEBHOOK_SECRET`; fails closed 503 if neither set) → `ingestArea` over
predefined hot bboxes.

**Tiles & cache:** `tiles.ts` quantizes bboxes to a ~0.1° grid; Upstash Redis
stores per-tile freshness so overlapping requests reuse ingestion work.

**Key files:** `src/lib/chargers/{types,tiles,normalize,dedup,confidence,query,repository}.ts`,
`src/lib/chargers/ingest/{ocm,overpass,bnetza,ndw,tomtom,chargeprice,index}.ts`,
`src/app/api/chargers/{route,nearby/route,search/route,[id]/route}.ts`,
`src/app/api/internal/warm/route.ts`, `vercel.json`,
`supabase/migrations/017_chargers.sql` (tables + GIST/trigram indexes),
`018_charger_queries.sql` (read RPCs), `019_charger_upsert.sql` (upsert RPC),
`020_charger_availability.sql` (availability param), `021_dedupe_coincident_chargers.sql`
(one-time coincident-row cleanup),
`src/lib/chargers/__tests__/` (normalize, ingest, dedup, confidence, query).

**Deployment prerequisites:** apply migrations 017–019 to Supabase (enables
`postgis` + `pg_trgm`). Env: `OPEN_CHARGE_MAP_API_KEY` (recommended),
`CHARGEPRICE_API_KEY` (optional), `CRON_SECRET` and/or `INGEST_WEBHOOK_SECRET`,
existing Upstash vars. **Until migrations are applied the `/api/chargers/*`
routes error;** the existing live `/api/charging-stations` map endpoint is
unchanged and keeps working in the meantime (still used by trip corridor search).

**Charger tables are shared reference data — not user-scoped** (no per-user RLS);
this is a deliberate, documented exception to the `.eq(user_id)` rule, which
applies only to user data.

**M6 — Charging map UI rewired (complete):** `charging-map-client.tsx` and
`StationMap.tsx` now consume `GET /api/chargers/nearby` (returns `Charger[]`
from PostGIS) instead of the old live `/api/charging-stations` endpoint.
Field mapping: `name ?? operator ?? "Stație încărcare"` for display name,
`address.city` for city, `connectors[0].powerKw ?? maxPowerKw` for power,
`connectors.map(c => c.type).join(", ")` for connector types, `confidence >= 0.5`
as proxy for operational status. Viewport-adaptive queries (moveend debounce,
radius from NE corner) and "N stations in view" count are preserved unchanged.
Key files changed: `src/app/(dashboard)/charging-map/charging-map-client.tsx`,
`src/components/charging-map/StationMap.tsx`.

**M8 — Non-blocking reads + list/search UI (complete):** `GET /api/chargers`
returns the current DB rows for the bbox **immediately** and refreshes stale
tiles in the background via `after()` (was: blocking `ensureAreaFresh` first,
which timed out on cold multi-source areas like Rotterdam — the map showed a
stuck "updating" badge and nothing rendered because `keepPreviousData` kept an
off-screen count). The client refetches once ~4 s after an empty result to
surface background-ingested stations without re-panning (`maxDuration` raised to
60 for the background work). New UI: a **List** button opens `StationListSheet`
— a bottom sheet listing in-view stations sorted by distance, with a search box
that queries `GET /api/chargers/search` (debounced 350 ms); tapping a row selects
it and recenters the map. Map pins now show the operator initial (⚡ fallback)
plus a price·power label. **Pins no longer flicker:** markers are memoized
(`useMemo` on stations+selection) so the cluster layer only rebuilds on real
data/selection change, and `MoveWatcher` skips no-op/micro viewport moves
(map settle, resize, sheet open). The Redis freshness namespace is `v3` (bumped
to re-ingest with operator-aware same-site dedup + the TomTom source, restoring
distinct co-located stations such as a Tesla Supercharger beside an AC charger).
Key files:
`src/components/charging-map/StationListSheet.tsx`,
`src/app/(dashboard)/charging-map/charging-map-client.tsx`,
`src/components/charging-map/StationMap.tsx`. i18n: `chargingMap.search_placeholder`,
`list_button`, `map_button`, `nearby_title`, `search_results_title`, `no_results`,
`distance_km`, `distance_m` (all 5 locales).

**M7 — Ingest observability endpoint (complete):**
`GET /api/internal/ingest-stats` returns the last 50 `ingest_runs` rows
(ordered by `started_at` desc) plus a `summary`
`{ totalRuns, okRuns, errorRuns, totalUpserted, lastRunAt }` for monitoring the
ingestion pipeline. Secret auth identical to the warm cron route
(`Authorization: Bearer $CRON_SECRET` or `x-webhook-secret: $INGEST_WEBHOOK_SECRET`;
fails closed 503 if neither set, 401 if not authorized). Reads via
`createSupabaseAdminClient()` (charger tables are shared reference data).
`maxDuration = 15`. Key file: `src/app/api/internal/ingest-stats/route.ts`.

**Trip corridor now reads from PostGIS (with Overpass fallback):**
`fetchCorridorStations` (used by the trip planner) now computes the corridor
bbox from the route polyline, calls `ensureAreaFresh(bbox)` then
`findInBBox({ bbox, limit: 500 })`, and maps each `Charger` → `ChargingStation`
(planner type). The "prefer DC fast ≥40kW, fall back to all if fewer than 3"
logic is preserved. If the PostGIS query throws or returns empty it falls back to
the legacy live Overpass query (`fetchCorridorStationsOverpass`), so trips keep
working before the charger migrations are applied. Same function signature and
return type — planner callers are unchanged. Key file:
`src/lib/external/routing/corridor-stations.ts`.

**Map filters + selected highlight (complete):** the charging map has a filter
bar (minimum power All/50+/150+/350 kW; connector All/CCS/Type 2/CHAdeMO/Tesla)
that flows into the `/api/chargers/nearby` query (`minKw`, `connector`) and the
React Query key. The selected marker renders larger (1.4×) in a blue ring above
its siblings (`zIndexOffset`). Icons are cached (3 variants) to avoid per-marker
re-allocation. Key files: `charging-map-client.tsx` (FilterChips), `StationMap.tsx`.

**M7 UI — charger health card (complete):** Settings → "Charger network" section
shows indexed-station counts and last-refresh time via a session-authed
`GET /api/chargers/stats` (`auth()` + rate-limit; returns
`{ totalChargers, fastChargers, lastRefresh }`; counts via Supabase
`head:true` + last ok `ingest_runs` row). Key files:
`src/app/api/chargers/stats/route.ts`, `src/components/settings/ChargerHealthCard.tsx`,
`src/app/(dashboard)/settings/settings-client.tsx`.

**Status:** backend complete (M0–M7 + BNetzA/NDW connectors) + M6 (UI rewiring)
+ map filters/highlight + M7 health card, 75 tests pass. Trip corridor search
reads from the PostGIS platform (Overpass fallback). ABRP-grade planner reading
from this data is spec #2.

---

## Scenario Switcher (mock vehicles)

**What it does:** Lets users change the simulated driving behaviour of a demo/mock vehicle without losing odometer continuity. Four scenarios are available: `commuter`, `weekend-errands`, `road-trip`, `vacation`. On switch, the full `mock_vehicle_state` row is reseeded from `createInitialSnapshot` while the existing odometer value is carried over.

**How to use it:** Settings → Vehicles section → expand a mock vehicle → select from the scenario dropdown. The dashboard reflects the new scenario immediately (TanStack Query invalidation).

**API:** `PATCH /api/vehicles/[vehicleId]` with `{ scenarioId: "road-trip" }`. Returns 400 if the vehicle is not `data_source === "mock"` or if the scenario ID is invalid.

**Key files:**
- `src/app/api/vehicles/[vehicleId]/route.ts` — PATCH handler (scenario switch logic)
- `src/app/api/vehicles/route.ts` — GET handler now returns `scenarioId` for mock vehicles
- `src/components/settings/ScenarioPicker.tsx` — client-side `<select>` with loading + toast feedback
- `src/app/(dashboard)/settings/settings-client.tsx` — wires ScenarioPicker per mock vehicle
- `src/lib/mock/scenarios.ts` — `listScenarios()`, `getScenario()`
- `src/lib/mock/seed.ts` — `createInitialSnapshot()`

**Dependencies:** `mock_vehicle_state.scenario_id` column, `sonner` toast, `next-intl` (`settings.scenario.*` keys in all 5 locales).

---

## Mobile Layout — iOS / iPhone Safe-Area Fixes

**What it does:** Ensures the app renders correctly on iPhone 15 (and any device with a Dynamic Island, notch, or home indicator gesture bar) by:
1. **Notch / Dynamic Island padding** — `TopBar` wraps its content in an `<header>` with an extra `<div aria-hidden className="h-[env(safe-area-inset-top)]" />` spacer. On notchless devices this div is zero-height.
2. **Home indicator / BottomNav** — `BottomNav` adds `pb-[env(safe-area-inset-bottom)]` so its touchable area never sits under the system gesture bar.
3. **Scroll container isolation** — `main` in the dashboard layout gets `overscroll-behavior-y: contain` (prevents scroll chaining to the body) and `-webkit-overflow-scrolling: touch` (smooth inertia on iOS). `body` gets `overscroll-behavior: none` (prevents the browser's own pull-to-refresh competing with the app's custom pull-to-refresh gesture).
4. **Scroll-to-top on nav re-tap** — `BottomNav` tapping an already-active tab now scrolls the `<main>` element instead of `window` (the actual scroll container in the layout).
5. **Viewport** — `viewportFit: "cover"` in `src/app/layout.tsx` `Viewport` export makes iOS return non-zero values for all `env(safe-area-inset-*)` variables.

**Key files:**
- `src/app/layout.tsx` — `viewport.viewportFit: "cover"`
- `src/components/layout/TopBar.tsx` — safe-area spacer div
- `src/components/layout/BottomNav.tsx` — `pb-[env(safe-area-inset-bottom)]`, scroll-to-top fix
- `src/app/globals.css` — `overscroll-behavior: none` on body, `overscroll-behavior-y: contain` + `-webkit-overflow-scrolling: touch` on main

**Dependencies:** None — all standard CSS / React.

---

## Trip Planner — Distinct Route Alternatives (ORS + dedup by output)

**What it does:** Surfaces genuinely different roads between two points and stops
showing the same road twice.

1. **Real alternatives via OpenRouteService.** OSRM's public server rarely
   returns more than the single fastest road for a long corridor (Cluj→București
   has the A1-via-Sibiu road and the Brașov/DN1 road, but OSRM surfaced only
   one). When `OPENROUTESERVICE_API_KEY` is set, `computeRouteAlternatives` uses
   ORS's `alternative_routes` algorithm (`target_count`, `share_factor`,
   `weight_factor`) to return roads that are actually different, then falls back
   to OSRM if ORS is unconfigured or fails. Same opt-in pattern as Open Charge
   Map. New file: `src/lib/external/routing/providers/ors-router.ts`.
2. **Dedup by plan output, not strategy.** The previous dedup key included the
   strategy name, so "fastest" (charge to 70%) and "balanced" (charge to 95%)
   survived as two chips even when they produced the *identical* road + single
   stop + time — the user saw two visually identical variants. The key is now
   `roundedDistance-stopStationIds-roundedTime`, so identical plans collapse
   while genuinely different roads (different distance and/or station set) stay
   distinct.

**Key files:** `src/lib/external/routing/planner.ts` (`computeRouteAlternatives`,
`planTripVariants` dedup), `src/lib/external/routing/providers/ors-router.ts` (new).

**Dependencies:** OpenRouteService (optional, free tier ~2000 req/day — set
`OPENROUTESERVICE_API_KEY`), OSRM public (fallback).

---

## Mobile UX Simplify — Navigation & Trip Planner

**What it does:** Reduces cognitive load on the 90%-mobile app based on a user-research study (JD Power 2025–2026, EAFO, Baymard, NNGroup):

1. **Bottom Nav → 4 tabs** (was 5 + drawer): **Car · Charging · Trip · More**. Trip planner is promoted from the buried "More" drawer (70%+ of EV users want trip planning; 44% never found it before) into the primary bar. `grid-cols-4` for more breathing room (41% of users prefer 4 tabs; NNGroup: hidden nav scores worst on every metric).
2. **More sheet** now holds the secondary destinations: Costs, Energy, Commands, Charging Map, Settings, About. Settings is no longer duplicated as a primary path.
3. **Trip Planner — map-first / compressed form:** The first interaction is just origin → destination → Plan. The battery slider and vehicle selector moved behind an "Options" disclosure (collapsed by default), so the form no longer stacks 5 controls over the map on open. Map height calc now also subtracts `env(safe-area-inset-top)` so the notch spacer doesn't push the map under the bottom nav.
4. **Station pins only after planning:** Confirmed `TripMap` already renders only the chosen `activePlan.stops` (plus origin/destination) — never the full network — so the map stays clean before a route is planned. No change needed.

**Key files:**
- `src/components/layout/BottomNav.tsx` — 4-tab structure, `grid-cols-4`
- `src/components/layout/SlideUpMenu.tsx` — More sheet items (Costs, Energy added; Trip removed)
- `src/app/(dashboard)/trip/trip-client.tsx` — `optionsOpen` disclosure, safe-area height calc
- `src/lib/i18n/locales/*.json` — `nav.mobile.trip`, `trip.options` in all 5 locales

**Dependencies:** None — no new libraries, no schema changes. OpenSpec change: `openspec/changes/mobile-ux-simplify/`.

---

## Perceived Performance — Optimistic UI & Loading States

**What it does:** Makes the app feel instant on mobile (speed is the #1 driver of EV-app satisfaction — JD Power 2025; users abandon when feedback takes >2-5s):

1. **Optimistic command UI** — `useVehicleCommand` now patches the `["vehicle", id]` React Query cache the moment a command is sent (lock/unlock, climate on/off, start/stop charging, set_charge_limit), so the dashboard quick actions and command panel reflect the new state instantly instead of waiting for the server round-trip + refetch. On error or server rejection it rolls back to the previous state; `onSettled` reconciles with the real server state. Command toasts are i18n (`commands.success` / `commands.error`).
2. **Route-level loading skeleton** — `src/app/(dashboard)/loading.tsx` is a Suspense fallback for every dashboard route. Server pages await `auth()` + Supabase before rendering; without this, Next.js froze the previous page until the RSC payload arrived (a dead tap on slow mobile). Now every navigation shows an instant glass skeleton.
3. **CommandPanel loading skeleton** — shows a skeleton grid while vehicle state loads instead of greyed-out buttons that looked broken. Removed redundant per-call toasts (the hook handles them centrally — was double-firing).

**Key files:**
- `src/hooks/useVehicleCommand.ts` — optimistic `onMutate` + rollback + i18n toasts
- `src/app/(dashboard)/loading.tsx` — route-level skeleton
- `src/components/vehicle/CommandPanel.tsx` — loading skeleton, deduped toasts

**Dependencies:** None — uses TanStack Query's optimistic-update pattern and Next.js App Router Suspense.

---

## Trip Cost — Energy Cost of the Distance (not just charging)

**What it does:** Fixes a bug where a trip that needed no charging stop showed "0.0 kWh · €0.00", implying the distance was free. Driving always consumes energy from the battery that must be recharged later. The planner now computes:
- **`tripEnergyKwh`** — total energy consumed over the whole route, derived from `distance / deratedFullRange × batteryCapacity`. This already accounts for **weather/temperature** (via range derating) and **road type/distance** (via the actual OSRM route polyline).
- **`tripEnergyCostEur`** — cost to put that energy back, priced at the user's **configured home tariff** (averaged across the day from `getProvider(tariff_provider).getTodayPrices()`), falling back to ~€0.20/kWh when no tariff is set.

The trip cost summary (`CostSummary`), the variant selector chips, and the petrol-savings comparison now use these distance-based figures, so the cost is always realistic — non-zero even for short, no-stop trips.

**Key files:**
- `src/lib/external/routing/planner.ts` — computes `tripEnergyKwh` / `tripEnergyCostEur`; `homePriceEurKwh` input + `DEFAULT_HOME_PRICE_EUR_KWH`
- `src/lib/external/routing/types.ts` — `TripPlan.tripEnergyKwh` / `tripEnergyCostEur`
- `src/app/api/trip-plan/route.ts` — `getHomePriceEurKwh()` reads the user's tariff provider
- `src/components/trip/CostSummary.tsx`, `src/app/(dashboard)/trip/trip-client.tsx` — display

**Dependencies:** tariff registry (`src/lib/external/tariffs/registry.ts`), `user_settings.tariff_provider`.

---

## Trip Planner — Personal Consumption Calibration

**What it does:** The planner now estimates range and trip energy from the
driver's **measured consumption**, not just the model's spec sheet. A
cold-climate or heavy-footed driver gets an accurate (shorter) range and a
realistic energy cost instead of the optimistic spec figure.

`getPersonalEfficiency(vehicleId)` in the trip-plan API computes kWh/100km as
`total charged energy ÷ total distance driven` from the vehicle's
`charging_sessions` (energy_added_kwh) and `trips` (distance_km / odometer
delta). It requires a meaningful sample (≥200 km, ≥5 kWh) and a plausible result
(8–45 kWh/100km); otherwise it returns undefined and the planner falls back to
`spec.efficiencyKwhPer100km`. The measured figure feeds both the range/feasibility
math and the weather-derating baseline.

**Key files:** `src/app/api/trip-plan/route.ts` (`getPersonalEfficiency`),
`src/lib/external/routing/planner.ts` (`efficiencyKwhPer100km` input).

---

## Charging Stations — Open Charge Map source + Moldova corridor

**What it does:** Fixes "No charging station found near km N" on routes through
sparsely-covered regions (e.g. Cluj → Iași through Moldova).

1. **Open Charge Map** (`fetchCorridorStationsOCM`) is now the primary live
   fallback for corridor stations — a dedicated, well-maintained global EV
   charging registry that's far more reliable from serverless than Overpass.
   Fallback chain: PostGIS platform → Open Charge Map → Overpass → static list.
   Optional `OPEN_CHARGE_MAP_API_KEY` env var raises rate limits.
2. **Static Moldova corridor stations** added to the registry (Târgu Mureș,
   Reghin, Bistrița, Vatra Dornei, Piatra Neamț, Bacău, Roman, Suceava) so the
   Cluj → Iași route always has a reachable station even when every live source
   is unreachable in the demo.

**Key files:** `src/lib/external/routing/corridor-stations.ts`,
`src/lib/external/charging-networks/stations.ts`.

---

## Trip Planner — More Route Alternatives

**What it does:** Surfaces genuinely different roads (e.g. the Suceava vs
Fălticeni corridor on Cluj → Iași) as separate selectable variants instead of
collapsing them into one.

- The planner keeps up to **3 OSRM road alternatives** (was 2).
- The variant dedup signature now includes `roadIndex`, so two physically
  different roads with a similar stop count and time are no longer merged — the
  previous signature (`stops-strategy-time`) hid real alternatives.
- The variant chip shows **distance** (`h m · km · stops · €`) so roads with the
  same strategy label are distinguishable at a glance.

Note: alternatives still depend on what OSRM returns for the origin/destination
pair; the planner now surfaces all distinct ones it gets rather than dropping
them.

**Key files:** `src/lib/external/routing/planner.ts` (`planTripVariants`),
`src/app/(dashboard)/trip/trip-client.tsx` (variant chip).

---

## Trip Planner — Parallelized Variant Calculation + `arrivalSocPct`

**What it does:**

1. **Performance: parallelized variant calculation (Promise.all)** — `planTripVariants` now fetches OSRM alternatives and corridor stations concurrently, then plans all road × strategy combinations in parallel (`Promise.all`). Previously each combination ran sequentially; with 3 roads × 2 strategies this cuts latency by ~5× on the planner hot path.

2. **`arrivalSocPct` parameter** — callers can now specify the minimum battery percentage required at the destination (and at each intermediate charging stop). Defaults to 10%. The planner computes available range as `(currentSocPct − arrivalSocPct) / 100 × deratedFullRangeKm`, and charges each stop to at least `arrivalSocPct` % above the next waypoint's need. Ensures drivers arrive with a user-controlled safety buffer instead of a hardcoded 0%.

**How to use:** `POST /api/trip-plan` with optional body field `arrivalSocPct` (number, 0–50).

**Key files:** `src/lib/external/routing/planner.ts` (`planTrip`, `planTripVariants`, `PlanInput`, `VariantsInput`), `src/app/api/trip-plan/route.ts` (`bodySchema`, both `planTripVariants` calls).

## Trip Planner — Charging Station Reliability Badge

**What it does:** Surfaces real station-reliability signals from Open Charge Map to fight the global EV "zombie station" problem (up to 16% of stations report a false status). Each charging stop sourced from OCM gets a small badge derived from OCM's `DateLastVerified` / `DateLastStatusUpdate` and `StatusType.IsOperational`:
- **offline** (red, `ShieldAlert`) — `IsOperational === false` → "Possibly offline".
- **stale** (amber, `ShieldAlert`) — last verified more than 90 days ago → "Not recently verified".
- **good** (green, `ShieldCheck`) — verified within 90 days → "Verified {days}d ago".
- **unknown** — no signal (static Tesla/IONITY stations) → no badge rendered.

**How to use:** Automatic in the `/trip` planner UI — the badge appears next to the network chip in both `StopCard` (plan list) and `StationDetailSheet` (station detail bottom sheet). No new API surface; the two `ChargingStation` fields flow through `POST /api/trip-plan` from the OCM corridor fetch.

**Key files:** `src/lib/external/routing/reliability.ts` (`stationReliability`, `daysSinceVerified`, `ReliabilityLevel`), `src/components/trip/ReliabilityBadge.tsx` (shared badge), `src/components/trip/StopCard.tsx` + `src/components/trip/StationDetailSheet.tsx` (render sites), `src/lib/external/charging-networks/types.ts` (`ChargingStation.lastVerifiedAt` / `isOperational`), `src/lib/external/routing/corridor-stations.ts` (`OcmPoi` mapping in `ocmToStation`). i18n: `trip.reliability.{offline,stale,verified}` in all 5 locales.

**Dependencies:** Open Charge Map API (already used by `fetchCorridorStationsOCM`); `lucide-react` icons; `next-intl`.

---

## Compact Mobile Redesign

**What it does:** Reduces wasted vertical space across the entire dashboard layout for a denser, more native-app-like mobile experience:

- **TopBar**: `h-14 → h-11` on mobile (saves 12px), Avatar `size-8` (32 px).
- **BottomNav**: tab padding `py-2 → py-1.5`, icons `size-5` (saves ~8px total).
- **Layout padding**: `py-6 pb-4 → py-4 pb-3` on the main scroll container.
- **PageWrapper gap**: `gap-4 → gap-3 md:gap-4`.
- **Dashboard HeroCard**: padding `p-6 → p-4`, SOC text `text-7xl → text-5xl`, range `text-3xl → text-2xl`, progress bar `mt-6 h-2.5 → mt-3 h-2`.
- **StatChips**: skeleton `h-20 w-28 → h-16 w-24`, chip card `w-[112px] p-4 → w-[96px] p-2.5`.
- **QuickActions**: grid `gap-3 → gap-2`, button `min-h-[52px] p-3 → min-h-[48px] p-2`.
- **ChargingOverlayCard**: padding `p-5 → p-4`, CircularProgress `size 80 → 72`.

All responsive — full values restore at `md:` breakpoint.

**Key files:** `src/components/layout/TopBar.tsx`, `src/components/layout/BottomNav.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/page-wrapper.tsx`, `src/app/(dashboard)/dashboard/dashboard-client.tsx`.

---

## Dashboard — Last Charge Chip

**What it does:** Fetches the most recent completed charging session for the selected vehicle and displays it as a "Last charge" chip in the StatChips row on the dashboard. Shows energy added (e.g., `+12.4 kWh`) when available, with a green History icon.

**How to use:** Automatic — the chip appears in the scrollable chip row below the HeroCard whenever a past session exists in `charging_sessions`.

**Key files:** `src/app/(dashboard)/dashboard/page.tsx` (server fetch), `src/app/(dashboard)/dashboard/dashboard-client.tsx` (chip render). i18n: `dashboard.chip_last_charge` in all 5 locales.

---

## Charging Map — Station Query Fix + BottomNav Sheet Fix

**Station query on locate**: `handleLocate` and `handleSilentLocate` now also call `setArea()` when the user's location is resolved. Previously, auto-locate moved the map view but left the query area at the default (Bucharest), causing 66 stations to load off-screen. Now the query resets immediately to the user's position.

**ChargerDetailSheet positioning**: Changed from `position: fixed` to `position: absolute` inside `<main>`. The sheet now slides up within the map area and cannot overlap the BottomNav below it. The backdrop is likewise `absolute`, covering only the map pane so the BottomNav remains tappable.

**Key files:** `src/app/(dashboard)/charging-map/charging-map-client.tsx`, `src/components/charging-map/ChargerDetailSheet.tsx`.

---

## TopBar — Full i18n (audit fix)

**What it does:** TopBar dropdown now uses `useTranslations("nav")` for all labels previously hardcoded in English: "Add vehicle", "Garage", "Settings", "Sign out", and the vehicle switcher placeholder. Keys added to all 5 locale files (en/ro/de/fr/hu).

**Key files:** `src/components/layout/TopBar.tsx`, `src/lib/i18n/locales/*.json` (`nav.add_vehicle`, `nav.garage`, `nav.sign_out`, `nav.select_vehicle`).

---

## Charging Map — Station Coverage Fix

**What it does:** Fixes two causes of too few stations appearing on the map after auto-locating to a new city.

1. **`resetKey` — clears stale cross-area data.** When the user auto-locates (mount-time GPS or button), `handleLocate`/`handleSilentLocate` now increment a `resetKey` counter included in the TanStack Query key. This forces a fresh fetch instead of showing `keepPreviousData` from the previous area (Bucharest stations bleeding into a Florești query). The badge previously read "200 stații - se actualizează" while displaying Bucharest pins ~50 km away.

2. **Ingest limits raised to 2000.** OCM `maxresults: 500 → 2000`; Overpass `out body center 500 → 2000` (timeout raised 15s → 25s to match). For large query radii (50–100 km), the previous 500-station cap silently truncated results in dense urban areas.

**Key files:** `src/app/(dashboard)/charging-map/charging-map-client.tsx` (`resetKey`), `src/lib/chargers/ingest/ocm.ts`, `src/lib/chargers/ingest/overpass.ts`.

---

## Charging Map — Viewport Query, Clustering & Basemap

**What it does:** Makes the map behave like AmpWhere — zoom/pan always refetches the visible area, dense or overlapping stations collapse into counted bubbles, and the basemap is a clean modern style.

1. **Viewport bbox query.** The map queries `GET /api/chargers?bbox=minLng,minLat,maxLng,maxLat` for the *actual* visible bounds instead of a radius around the centre. `MoveWatcher` listens to both `moveend` and `zoomend` (mobile pinch-zoom fires `zoomend` without `moveend` when the centre stays fixed), so any zoom or pan that changes the viewport triggers a fresh fetch. The TanStack Query key uses the four bbox edges.

2. **Marker clustering.** Stations are rendered as `L.Marker` with a **plain-CSS circular `DivIcon`** (not SVG — SVG DivIcons render blank on mobile WebKit), wrapped in a `MarkerClusterGroup` (`react-leaflet-cluster` + `leaflet.markercluster`). Nearby/overlapping sites merge into a dark-glass bubble showing the count, which splits apart as you zoom in (`maxClusterRadius={50}`, `spiderfyOnMaxZoom`). This fixes "the badge says 11 but I only see a few pins" — co-located stations were stacking on top of each other. Icons are cached per colour+selected state. Power-tier colours (red 350+/orange 150+/green 50+/blue <50/grey offline) are preserved.

3. **Basemap.** Switched from raw OpenStreetMap raster tiles to **CARTO Voyager** (`basemaps.cartocdn.com/rastertiles/voyager`) — a clean, modern OSM-based style, free and key-less. (True OpenMapTiles vector styles require a provider API key e.g. MapTiler + MapLibre GL; CARTO gives the same look as a drop-in `TileLayer` URL with no key.)

**Note:** the `chargers_in_bbox` / `chargers_nearby` RPCs still hard-cap results at 500 inside the SQL (`least(p_limit, 500)`). Not a bottleneck today (typical city viewports return far fewer), but a future migration can raise it for very dense metros.

**Key files:** `src/components/charging-map/StationMap.tsx` (clustering, CSS DivIcon, CARTO tiles, `ViewportBBox`), `src/app/(dashboard)/charging-map/charging-map-client.tsx` (bbox query), `src/app/api/chargers/route.ts` (limit cap raised to 2000).

**Dependencies:** `react-leaflet-cluster`, `leaflet.markercluster`, `@types/leaflet.markercluster`.

---

## Charging Map — Real Operational Status (OCM)

**What it does:** Replaces the fake "operational" proxy (`confidence >= 0.5`) with a real status ingested from Open Charge Map. Each charger now has a populated `availability`: `operational` | `offline` | `stale` | `unknown`.

- **Derivation (ingest):** the OCM mapper reads `StatusType.IsOperational` (or `StatusTypeID` under compact mode — 50/75/150 = operational, 30/100/200/210 = not) and `DateLastVerified`/`DateLastStatusUpdate`. An operational station not verified in the last `STALE_AFTER_DAYS` (90) days is downgraded to `stale`. No signal → `unknown`.
- **Merge (dedup):** when co-located records from multiple sources cluster, the most informative status wins (`operational` > `offline` > `stale` > `unknown`).
- **Map:** a pin greys out only when status is explicitly `offline` — `unknown`/`stale` keep their power-tier colour (most OCM rows are unknown; greying them would wash the map grey).
- **Detail sheet:** a 4-state status dot + label (green operational / red offline / amber stale / grey unknown), i18n `chargingMap.status_stale` + `status_unknown` (added to all 5 locales; `operational`/`out_of_service` reused).

**Tesla Superchargers:** already flow in through OCM — `normalize.ts` maps OCM connection-type **30 (Tesla Supercharger) → `tesla`** and aliases the Tesla operator. OCM has the best openly-available Tesla coverage without Tesla CPO credentials, so Superchargers are ingested and tagged like any other network (red Tesla badge in the detail sheet). A dedicated live Tesla feed would require Tesla's (unofficial) endpoints or a roaming hub.

**⚠️ Deployment:** apply migration `020_charger_availability.sql` (adds `p_availability` to `upsert_charger`) **before/with** this deploy — the ingest path passes the new param, so an un-migrated DB would reject upserts. The read RPCs (018) already returned `availability`, so no read-side migration was needed. Until the cron/lazy ingest re-runs an area, existing rows keep their old `unknown` value.

**Key files:** `src/lib/chargers/types.ts` (`ChargerAvailability`, `STALE_AFTER_DAYS`), `src/lib/chargers/ingest/ocm.ts` (`deriveAvailability`), `src/lib/chargers/dedup.ts` (`mergeAvailability`), `src/lib/chargers/repository.ts` (`p_availability`), `src/lib/chargers/query.ts` (`toAvailability`), `supabase/migrations/020_charger_availability.sql`, `src/components/charging-map/StationMap.tsx`, `src/components/charging-map/ChargerDetailSheet.tsx`.

## Charge Curves — Per-Vehicle Exported Shape (TESLA_NMC_CURVE)

**What it does:** Adds `ChargeCurvePoint[]` interface and `TESLA_NMC_CURVE` export to `charge-curve.ts` so `ModelSpec` can carry the curve for each vehicle. Enables future UI visualization (charging speed vs SoC). The existing `chargeMinutes()` function already integrated the curve — this makes the shape an explicit part of each model spec.

**Key files:** `src/lib/external/routing/charge-curve.ts` (`ChargeCurvePoint`, `TESLA_NMC_CURVE`), `src/lib/brands/models.ts` (`ModelSpec.chargeCurve`).

## Weather — Open-Meteo Real Weather (replaces mock)

**What it does:** Replaces `mock-weather.ts` (deterministic formula) with real temperature, wind, and precipitation from Open-Meteo's public API. Range derating now uses actual conditions at the trip origin so cold/wet trips show a shorter derated range than summer trips.

**How to use:** Automatic in `POST /api/trip-plan`. The `getWeatherAsync(lat, lng)` helper fetches current conditions and caches per 0.1° cell. The in-memory cache has a **30-minute TTL** (`CACHE_TTL_MS`); entries older than that trigger a refetch so stale weather is never served indefinitely. Falls back to a mild neutral snapshot if the API is unreachable.

**Important:** Open-Meteo free tier is non-commercial only. Production SaaS use requires a paid plan ($29–99/month). Set `OPEN_METEO_API_KEY` if/when upgrading (currently unused — the public endpoint works without a key).

**Key files:** `src/lib/external/weather/providers/open-meteo.ts` (new), `src/app/api/trip-plan/route.ts` (uses `getWeatherAsync`).

## External-provider data fixes (weather TTL, Tibber DST + zero-price)

**What it does:** Three backend correctness fixes for external data providers.

1. **Weather cache TTL** — the in-memory Open-Meteo `Map` cache previously had no expiry, so the first fetched snapshot for a given 0.1° cell was served forever. Cache entries now store `fetchedAt` and are gated by a 30-minute `CACHE_TTL_MS`; expired entries fall through to a refetch (both the sync `getCurrent` wrapper and `getWeatherAsync`).
2. **Tibber DST-safe hour mapping** — hourly price points were mapped to hours via `new Date(startsAt).getHours()`, which re-interprets the timestamp in the *server's* timezone and breaks across DST boundaries. `parseLocalHour()` now reads the `HH` field straight from the ISO 8601 string, which already carries the home's correct local offset on each side of a DST change. No hardcoded UTC offset.
3. **Zero-price "free charging" guard** — a Tibber price of `0` (or missing) means "no data", not free electricity. Such entries are now dropped from the price list (`if (!(priceEurKwh > 0)) return null`), and the no-cache fallback returns an empty array instead of 24 zero-priced hours, so downstream smart-charge/forecast logic falls back rather than reporting free charging. Legitimately low but non-zero prices are unaffected.

**How to use:** Transparent to callers. Used by `GET /api/tariffs/prices`, `GET /api/tariffs/settings`, and `POST /api/trip-plan` (home tariff + weather derating).

**Key files:** `src/lib/external/weather/providers/open-meteo.ts`, `src/lib/external/tariffs/providers/tibber.ts`.

**Dependencies:** Open-Meteo public API, Tibber GraphQL (`TIBBER_TOKEN`).

## Charger Sources — Austria (data.gv.at) + France IRVE (data.gouv.fr)

**What it does:** Adds two new charger ingest sources:

- **Austria** (`src/lib/chargers/ingest/austria.ts`): ArcGIS REST API, same pattern as BNetzA. Bbox-gated to AT bounds (46.3–49.1°N, 9.5–17.2°E). Covers the DE→AT→HU→RO corridor where BNetzA coverage ends at the German border.
- **IRVE France** (`src/lib/chargers/ingest/irve.ts`): daily consolidated GeoJSON from data.gouv.fr (~90k+ points, legally mandated under EU AFIR). Loaded once per 6 hours (module-level cache), then filtered by tile bbox. Bbox-gated to metropolitan France.

Both sources are fault-tolerant (return `[]` on error), fire in parallel with all other sources in `fetchAllSources()`, and flow through the existing dedup/merge pipeline.

**Key files:** `src/lib/chargers/ingest/austria.ts` (new), `src/lib/chargers/ingest/irve.ts` (new), `src/lib/chargers/ingest/index.ts` (added), `src/lib/chargers/types.ts` (`"austria" | "irve"` added to `ChargerSourceId`).

**Note on IRVE:** The IRVE connector fetches the full ~90k feature GeoJSON on first tile load within France. This is a one-time cost per cold-start (~2–5 MB); subsequent calls are in-memory filtered. Consider a background pre-warm at deploy time for production.

---

## Code Review Fixes — Security, i18n, Charger Pipeline (2026-06-09)

**What it does:** Addresses 5 blockers + 1 warn found in a multi-agent code review pass.

- **Security (IDOR):** `GET /api/documents` now adds `.eq("user_id", userId)` on the documents query in addition to the vehicle ownership check, preventing a crafted `vehicleId` from leaking another user's documents if DB-level RLS is misconfigured.
- **i18n:** Hardcoded Romanian string `"Locația nu a fost găsită"` in `GeocodingSearch.tsx` replaced with `t("location_not_found")` from the `trip` namespace. Key added to all 5 locales (en/ro/de/fr/hu).
- **Zero-kW stations:** Trip planner (`planner.ts`) now filters out charging candidates with `maxKw <= 0` before sorting, preventing division-by-zero / infinite charge-time in `chargeMinutes()`.
- **Charger dedup priority:** `CORE_PRIORITY` in `dedup.ts` updated to rank all sources: `ocm → tomtom → osm → bnetza → ndw → austria → irve → chargeprice`.
- **Source ID registry:** `SOURCE_IDS` in `query.ts` and `ChargerSourceId` union in `types.ts` updated to include `"tomtom"`, `"austria"`, and `"irve"` — previously only `ocm/osm/chargeprice/bnetza/ndw` were listed, causing silent drops for the new connectors.
- **Error logging:** `repository.ts` now logs failed RPC upserts via `console.error` instead of silently discarding them.

**Key files:** `src/app/api/documents/route.ts`, `src/components/trip/GeocodingSearch.tsx`, `src/lib/external/routing/planner.ts`, `src/lib/chargers/dedup.ts`, `src/lib/chargers/query.ts`, `src/lib/chargers/types.ts`, `src/lib/chargers/repository.ts`, `src/lib/i18n/locales/{en,ro,de,fr,hu}.json`.

## Mobile UI Compaction Pass (2026-06-09)

**What it does:** Tightens vertical spacing on the primary mobile screens (~50-60px reclaimed on the dashboard viewport) without touching logic or shrinking touch targets below 44px.

- **HeroCard**: `p-4→p-3`, header `mb-3→mb-2`, SOC bar `mt-3→mt-2`, charging label `mt-2→mt-1.5`, SOC/km gap `gap-1→gap-0.5` (mobile only — `md:` values unchanged).
- **StatChips**: row gap `2→1.5`, chip padding `2.5→2`, skeletons resized to match (`h-16→h-14`).
- **QuickActions**: `min-h-[48px]→min-h-11` (44px, iOS touch minimum), `gap-1→gap-0.5`, `p-2→p-1.5`.
- **PageWrapper**: section gap `gap-3→gap-2.5` on mobile.
- **BottomNav**: spacer `3.25rem→3rem`, tab `py-1.5→py-1`.
- **MockGlobalBanner**: `py-2.5→py-2`. **CostSummary** (trip): chip gaps `1.5→1`.

**Key files:** `src/app/(dashboard)/dashboard/dashboard-client.tsx`, `src/components/layout/{page-wrapper,BottomNav,MockGlobalBanner}.tsx`, `src/components/trip/CostSummary.tsx`.

## Charging Map — Cold-Area Polling Indicator (2026-06-09)

**What it does:** When the map shows a cold (never-ingested) area, the server returns `[]` immediately and ingests in the background. The client now polls up to 3 times at 4s intervals (was: a single retry) and shows a pulsing "Looking for stations in this area…" badge instead of a misleading "0 stations" count, so cold areas read as *loading*, not *empty*.

**How to use:** `/charging-map` — pan to an uncached area; the bottom-left badge switches to the searching state until stations arrive or polling gives up.

**Key files:** `src/app/(dashboard)/charging-map/charging-map-client.tsx` (`COLD_POLL_ATTEMPTS`, `ingesting` state). i18n: `chargingMap.ingesting_area` in all 5 locales.

**Dependencies:** part of the charger-loading speedup (bulk country imports + batched upserts land separately).
---

## Charger Ingest — Batched Hash-Aware Upsert + Country/Tile Freshness (2026-06-09)

**What it does:** Replaces per-charger RPC calls with a single batched DB round-trip per 200-charger chunk, skips DB writes for unchanged rows using a content hash, batches Redis freshness reads, and adds country-level freshness so bulk-imported countries skip lazy tile ingest entirely.

- **`upsert_chargers_batch` RPC** (migration 022): accepts a JSONB array; for each element: inserts new rows, skips all writes (only touches `last_seen_at`) when `source_hash` matches, or performs a full update + connector replace + sources upsert when the hash differs. Returns the count of rows processed.
- **`persistClusters(clusters)`**: chunks `ChargerCluster[]` into groups of 200, calls `upsert_chargers_batch` per chunk, logs errors per chunk, returns total processed count.
- **Batched Redis reads in `ensureAreaFresh`**: replaces N sequential `redis.get` calls with one `redis.mget` for all tile freshness keys.
- **Country freshness**: `markCountryFresh(cc)` sets a 48-hour Redis key (`chargers:country:v1:{cc}`) for a `BulkCountry`. `ensureAreaFresh` checks this key first — if the entire bbox is inside a fresh bulk country, tile-level ingest is skipped entirely.
- **Tile freshness namespace bumped v3 → v4** to force re-ingest of existing cached tiles with the new pipeline.

**How to use:**
- Call `persistClusters(clusters)` directly to persist a pre-clustered batch.
- Call `markCountryFresh("de")` after a bulk country import to block lazy re-ingest for 48 h.
- `ingestArea` / `ensureAreaFresh` are unchanged in signature; both use the new implementations automatically.

**Key files:** `src/lib/chargers/repository.ts`, `src/lib/chargers/countries.ts`, `supabase/migrations/022_batch_upsert_chargers.sql`.

**Dependencies:** Upstash Redis (`redis.mget`), Supabase RPC, `node:crypto` (SHA-1 hash).

## Charger Speedup — Senior Review Fixes (2026-06-09)

**What it does:** Fixes found in the post-implementation review of the charger-loading speedup.

- **[BLOCKER] ro/hu/at bulk freshness:** countries without a trusted full official source now fetch OCM in **full** (no `modifiedsince`) before being marked country-fresh; previously a 7-day incremental could mark a cold country fresh, suppressing lazy ingest for 48h. `FULL_OFFICIAL_SOURCE` in `bulk.ts` whitelists fr/de/nl for incremental OCM top-ups.
- **Fail-safe freshness:** `markCountryFresh` now requires `totalUpserted > 0` — a full-country fetch returning 0 rows is always a source failure, never a no-op.
- **Hash determinism:** `computeClusterHash` sorts connectors/sources before hashing so re-ingest ordering differences don't defeat the unchanged-row skip.
- **Dense cells:** internal `findInBBox` cap raised 2000→5000 (public API still clamps to 2000) so dedup in dense 1°×1° cells sees all existing rows instead of re-inserting duplicates.
- **Client:** cold-area polling indicator is gated on no-active-filters — an empty filtered result is "no matches", not a cold area.
- **Docs:** Austria connector comment corrected (Burgenland state endpoint, not national).

**Key files:** `src/lib/chargers/ingest/bulk.ts`, `src/lib/chargers/repository.ts`, `src/lib/chargers/query.ts`, `src/lib/chargers/ingest/austria.ts`, `src/app/(dashboard)/charging-map/charging-map-client.tsx`, `supabase/migrations/022_batch_upsert_chargers.sql`.

---

## Visual Design Refresh — Tesla/Apple-inspired Clean Dark Theme

**What it does:** A pure styling pass to modernize the app's visual language, inspired by the Tesla app, Apple Maps, and ABRP. No API, hook, or state changes — className/CSS updates only.

**Changes:**
- `globals.css` — added `.surface-card` (minimal elevation card, no blur) and `.pill-float` (floating pill for map overlays); tightened dark-mode border opacity from 8% → 6% and filter chips from `white/10` → `white/6`.
- `TopBar.tsx` — `h-11` on mobile, car icon prefix on vehicle picker, `gap-1` on right controls, border only on `md:`.
- `dashboard-client.tsx` — HeroCard drops gradient bg for clean dark surface `oklch(0.13 0.02 265)`; border reduced to `white/6`; stat chips use flat `bg-white/[0.04] border-white/6`; quick-action buttons same treatment.
- `charging-map-client.tsx` — filter toggle uses `.pill-float`; filter rows use `border-white/6`; station count badge uses `.pill-float`.
- `StationMap.tsx` — cluster bubbles switch from dark-glass to primary-blue pill (`oklch(0.62 0.19 250 / 0.9)`); location button uses cleaner rounded-xl surface.
- `settings-client.tsx` — section headers `text-[10px] tracking-widest text-muted-foreground/50`; dividers `divide-white/[0.04]`.
- `garage-client.tsx` — vehicle card overlay `border-white/6`; silhouette opacity raised to 30%; demo badge slightly more subtle.
- `login/page.tsx` + `register/page.tsx` — removed `glass-card` wrapper; forms float directly on the dark background.
- `LoginForm.tsx` — inputs `text-base` (prevents iOS auto-zoom); borders `white/6`; Google button `bg-white/[0.04]`.
- `trip-client.tsx` — Plan button flat `bg-primary rounded-xl` (no gradient); search overlay + results sheet use `border-white/6 bg-[oklch(…/0.92)] backdrop-blur-md`.

**Key files:** `src/app/globals.css`, `src/components/layout/TopBar.tsx`, `src/app/(dashboard)/dashboard/dashboard-client.tsx`, `src/app/(dashboard)/charging-map/charging-map-client.tsx`, `src/components/charging-map/StationMap.tsx`, `src/app/(dashboard)/settings/settings-client.tsx`, `src/app/(dashboard)/garage/garage-client.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/components/auth/LoginForm.tsx`, `src/app/(dashboard)/trip/trip-client.tsx`.

**Dependencies:** No new deps — all changes are Tailwind utility classes and CSS custom properties.

---

## Flux 2027 Design System — Foundation Layer

**What it does:** Establishes the CSS token foundation, a scroll-aware navigation hook, and a redesigned floating-pill bottom nav for the "Flux 2027" visual direction.

**Changes:**
- `globals.css` — `--radius` tightened to `0.625rem`. New `@theme inline` tokens: `--radius-xs/sm/md/lg/xl/pill`, `--text-2xs/xs`. New utility classes: `.data-card`, `.action-card`, `.auth-input`, `.ambient-charging/low/full`. Body gains `transition: background-color 1.4s ease`.
- `useScrollDirection.ts` (new) — returns `"top" | "up" | "down"` via rAF-throttled passive scroll listener.
- `BottomNav.tsx` — full rewrite to floating centered pill. Auto-hides on scroll down. Tab order: Car · Map · Charging · More.
- `TopBar.tsx` — `h-11 → h-10` mobile.
- `(dashboard)/layout.tsx` — `pb-[calc(72px+env(safe-area-inset-bottom))]` on main.

**Key files:** `src/app/globals.css`, `src/hooks/useScrollDirection.ts`, `src/components/layout/BottomNav.tsx`, `src/components/layout/TopBar.tsx`, `src/app/(dashboard)/layout.tsx`.

**Dependencies:** Framer Motion (already installed). No new npm packages.

---

## Flux 2027 Design System — Auth Borderless Inputs & Minimal Layout

**What it does:** Visual redesign of `/login` and `/register` — borderless bottom-line inputs, compact buttons, minimal centered layout. Zero API/logic changes.

**Changes:**
- `LoginForm.tsx` — inputs use `.auth-input` class (borderless bottom-line). Uppercase micro-labels above fields. `h-10 rounded-[10px]` on all buttons. `space-y-5` form spacing. Toggle link inline with `·` separator.
- `login/page.tsx` + `register/page.tsx` — `flex min-h-[100dvh]` centered layout, `max-w-xs`, "flux" wordmark + tagline above form.

**Key files:** `src/components/auth/LoginForm.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/lib/i18n/locales/*.json`.

**i18n:** `auth.email_label`, `auth.password_label`, `auth.tagline` in all 5 locales.

**Dependencies:** No new npm packages.

---

## Flux 2027 Design System — Settings Collapsible Sections

**What it does:** Compact rows and progressive disclosure for the Settings screen.

- Row height reduced: `min-h-[52px]` → `min-h-[44px]`, `py-3` → `py-2.5`.
- Section headers near-invisible structural markers (`text-muted-foreground/40`), no bold titles.
- Section order: Esențial (preferences) → Home location → Energy tariff → Vehicles → Contul & Billing (collapsed by default) → Avansat (collapsed by default).
- "Contul & Billing" collapses account info + subscription + danger zone under one togglable header.
- "Avansat" collapses WhatsApp picker + charger network health under one togglable header.
- Collapse state persisted to `localStorage` keys `settings-billing-open` / `settings-advanced-open`.

**How to use:** Visit `/settings`. Click the section header button to expand/collapse. Preference survives page reload.

**Key files:** `src/app/(dashboard)/settings/settings-client.tsx`, `src/lib/i18n/locales/{en,ro,de,fr,hu}.json`.

**Dependencies:** React `useState`, `localStorage`, `lucide-react` `ChevronDown`, `next-intl`.

---

## Flux 2027 Design System — Map 3-State Bottom Sheet

**What it does:** The map bottom sheet now cycles through 3 discrete snap heights via a clickable drag handle: collapsed (68 px — shows summary strip only), mid (44 vh — shows charger list or trip form), full (90 dvh — full screen). Clicking the handle pill advances through the states; dragging still snaps to the nearest. Filter chips updated to compact `h-7 text-xs rounded-full`.

**How to use:** Visit `/map`. Tap the handle pill at the top of the bottom sheet to cycle states. The collapsed state shows the nearest charger name/power or an active trip summary strip.

**Key files:** `src/app/(dashboard)/map/map-client.tsx`.

**Dependencies:** Framer Motion (`useAnimation`, `motion.div`). No new npm packages.

---

## Flux 2027 Design System — Onboarding Overlay v2

**What it does:** Full-screen 3-screen onboarding overlay shown once to new users (`localStorage["flux-onboarding-v2"] !== "done"`). Screens: Welcome → Track costs → Plan trips. Animated slide transitions (`AnimatePresence` + `motion.div`). Replaces `GettingStartedCard` in the dashboard return tree.

**How to use:** Shown automatically on first visit to `/dashboard`. Advance via CTA buttons; skip via "Skip" link on screens 1–2. Sets `flux-onboarding-v2=done` in localStorage on completion or skip.

**Key files:** `src/components/onboarding/OnboardingOverlay.tsx` (new), `src/app/(dashboard)/dashboard/dashboard-client.tsx`, `src/lib/i18n/locales/{en,ro,de,fr,hu}.json`.

**i18n namespace:** `onboarding_v2` in all 5 locales. Keys: `welcome_title`, `welcome_sub`, `welcome_cta`, `step_costs_title`, `step_costs_body`, `step_costs_cta`, `step_trip_title`, `step_trip_body`, `step_trip_cta`, `skip`.

**Dependencies:** Framer Motion (`AnimatePresence`, `motion.div`), `next-intl`. No new npm packages.


---

## Flux 2027 Design System — Settings / Map / Garage Polish (Wave 3C)

**What it does:** Removes colored icon circles from Settings rows; replaces bordered inputs and selects with `auth-input` (bottom-line style); updates the Map bottom sheet tab switcher from pill style to underline/motion indicator; replaces SOC sliders with slim custom track (h-1) + circular thumb; updates AddVehicleModal to use plain `div` container instead of shadcn Card, and removes the success circle bg container. All buttons capped at `h-11 rounded-[10px]` (primary) / `h-10 rounded-[10px]` (secondary).

**How to use:** Visit `/settings`, `/map`, `/garage` to see the visual changes. No new functionality — styling-only polish.

**Key files:**
- `src/app/(dashboard)/settings/settings-client.tsx` — icon bg containers removed; `SettingsRow`/`SettingsRowExpanded` simplified.
- `src/app/(dashboard)/garage/garage-client.tsx` — AddVehicleCard icon cleaned.
- `src/components/onboarding/AddVehicleModal.tsx` — Card → plain div; inputs/selects → auth-input; success icon circle removed; button heights.
- `src/app/(dashboard)/map/map-client.tsx` — tab switcher → underline+motion; sliders → slim; vehicle select → auth-input; plan CTA → h-11; trip summary text sizing.

**Dependencies:** Framer Motion (already in tree), `auth-input` CSS class (already in `globals.css`).

---

## Flux 2027 Design System — Vehicle Card Polish (Wave 3A)

**What it does:** Visual polish pass on all vehicle dashboard cards to align with the 2027 design system. Changes across every card: shadcn `Card`/`CardHeader`/`CardContent` replaced with `GlassCard` + plain `<div>` wrappers; all colored icons converted to monochrome `size-4 text-muted-foreground shrink-0`; section labels changed to `text-[10px] tracking-[0.12em] uppercase text-muted-foreground/50`; hero/stat numbers changed from `font-bold`/`font-semibold` to `font-thin`.

- `DepartureCard`: Removed old `Card` imports; time input uses `auth-input w-full` (borderless bottom-line); buttons updated to `h-10 rounded-[10px]`.
- `CommandPanel`: Quick-action buttons converted from large `min-h-[80px]` card grid to compact `size-9 rounded-full` circular icon-only buttons with `aria-label` for accessibility.
- `BatteryHealthCard`: Created with `GlassCard`, `font-thin` percentage, monochrome `HeartPulse` icon.
- `StatsGrid`: Created with `GlassCard` per stat tile, monochrome icons, `text-[10px]` labels, `text-sm font-medium` values.
- `TirePressureCard`: Created with `GlassCard`, `font-thin` pressure numbers, `text-[10px]` position labels.
- `WeatherRangeCard`: Created with `GlassCard`, monochrome weather icons, `font-thin` range number.
- `DoorsWindowsCard`: Created with `GlassCard`, monochrome `DoorOpen` icon, `text-[10px]` sub-labels.
- `ScoresCard`: Created with `GlassCard`, `font-thin` score numbers, `text-[10px]` labels with icons.
- `SentryDashcamCard`: Created with `GlassCard`, monochrome `Shield`/`Camera` icons.
- `SoftwareCard`: Created with `GlassCard`, monochrome `Cpu` icon.

**How to use:** Cards are imported and rendered in the vehicle dashboard. `CommandPanel` is used in the dashboard quick-actions area.

**Key files:** `src/components/vehicle/DepartureCard.tsx`, `src/components/vehicle/CommandPanel.tsx`, `src/components/vehicle/BatteryHealthCard.tsx`, `src/components/vehicle/StatsGrid.tsx`, `src/components/vehicle/TirePressureCard.tsx`, `src/components/vehicle/WeatherRangeCard.tsx`, `src/components/vehicle/DoorsWindowsCard.tsx`, `src/components/vehicle/ScoresCard.tsx`, `src/components/vehicle/SentryDashcamCard.tsx`, `src/components/vehicle/SoftwareCard.tsx`.

**Dependencies:** `GlassCard` (`src/components/ui/glass-card.tsx`). No new npm packages.

---

## More Menu — Compact Grid

**What it does:** The "More" slide-up sheet (BottomNav → More tab) renders its 6 destinations as a 2-column grid of compact monochrome tiles instead of a 6-row vertical list — the sheet is half as tall and items need less thumb travel. Colored icon circles removed (bare `size-4 text-muted-foreground` icons, 2027 design); the sheet title removed (drag handle + small `size-8` close button remain); items ordered by frequency of use: Costs, Energy, Charging map, Commands, Settings, About data. Capability gating (`✦` unlock hint) still renders inline after the label; drag-to-dismiss, backdrop, and safe-area padding unchanged.

**How to use:** Mobile only — tap "More" in the bottom nav; tap a tile to navigate (sheet closes), drag down or tap X to dismiss.

**Key files:** `src/components/layout/SlideUpMenu.tsx`.

**Dependencies:** None — Framer Motion and `useCapabilities` already in use.

---

## Trip Planning Accuracy — Geocode Bias + Distinct Route Variants

**What it does:** Two accuracy fixes for trip planning. (1) Geocoding now supports location bias and country filtering, so ambiguous place names ("Florești" — 3+ towns in Romania) resolve to the one near the user, and destination searches favor the travel direction. (2) Route variant dedup no longer collapses genuinely different roads that happen to share the same charging stops and time bucket — the dedup signature now leads with the road alternative index, so distinct corridors survive while two strategies producing the identical plan on the same road still collapse.

**How to use:** `GET /api/geocode?q=...` accepts optional `lat`/`lng` (bias point, validated finite + in range) and `cc` (comma-separated ISO country codes, e.g. `ro,hu`). Bias maps to TomTom `lat`/`lon`, Photon `lat`/`lon`, Nominatim unbounded `viewbox`; `cc` maps to TomTom `countrySet` and Nominatim `countrycodes` (Photon has no country filter). The UI wires bias automatically: origin search → user location (silent geolocate / map center), destination search → selected origin. No params → behavior unchanged.

**Key files:** `src/app/api/geocode/route.ts`, `src/components/trip/GeocodingSearch.tsx` (`bias` prop), `src/app/(dashboard)/map/map-client.tsx`, `src/app/(dashboard)/trip/trip-client.tsx`, `src/lib/external/routing/planner.ts` (`planTripVariants` dedup signature).

**Dependencies:** None new — existing TomTom/Photon/Nominatim cascade, browser geolocation.

---

## PWA Standalone Display Fixes

**What it does:** Fixes installed-PWA (display-mode: standalone) layout collisions on the map screens. The map bottom sheet's collapsed summary strip is now anchored at `bottom: calc(env(safe-area-inset-bottom) + 78px)` so it sits fully visible and tappable above the floating pill BottomNav (which sits at `bottom: calc(14px + env(safe-area-inset-bottom))`); in mid/full states the sheet returns to the screen bottom edge and slides over the nav. Drag-release now syncs the 3-state sheet state so the offset applies after drags too. Leaflet bottom controls (attribution, locate button) are lifted by `env(safe-area-inset-bottom) + 8px` so the attribution stays readable above the home indicator. A `display-mode: standalone` media query disables iOS rubber-band over-scroll and the tap highlight flash.

**How to use:** Automatic. Visible on `/map` and `/charging-map` in the installed PWA (or any mobile viewport with a bottom safe area).

**Key files:** `src/app/(dashboard)/map/map-client.tsx` (sheet bottom anchor + drag-end state sync + content bottom padding), `src/app/globals.css` (`.leaflet-bottom` offset, standalone media query).

---

## Security hardening: webhook auth + Tesla route rate limits

**What it does:** Two security fixes:
1. Inbound-email webhook (`POST /api/documents/inbound-email`) accepts **only** the `x-webhook-secret` header for authentication. The `?secret=` query-param fallback was removed to prevent secrets leaking into access logs and proxy caches.
2. `GET /api/tesla/vehicle` (legacy live-vehicle-data endpoint) now enforces a rate limit of 60 requests per window via `checkRateLimit(userId, "tesla-vehicle", 60)`, consistent with other Tesla routes.

**How to use:** No API change — callers must send `x-webhook-secret: <value>` header (never a query param). The Tesla vehicle route rate-limit is transparent to callers; breaches return HTTP 429.

**Key files:** `src/app/api/documents/inbound-email/route.ts`, `src/app/api/tesla/vehicle/route.ts`.

**Dependencies:** `src/lib/rate-limit.ts`.

**Dependencies:** None new. Applies to the shared `StationMap`/`TripMap` Leaflet components, so `/charging-map` gets the attribution fix via the same global CSS.

---

## Accessibility & UX Polish — Wave 5 (User Research)

**What it does:** P0/P1 accessibility and readability fixes across the app based on user research across 10 personas.

1. **Text size floor (12px min):** All `text-[10px]` user-visible labels replaced with `text-xs` (12px) across vehicle cards, settings, sidebar, auth, and chart tooltips. Passes WCAG AA at iOS Large Text sizes.
2. **Contrast improvement:** Section header and stat label opacity raised from `/40`–`/50` to `/60`–`/70` on `text-muted-foreground`, improving readability without visual noise.
3. **Auth input border visibility:** `.auth-input` border-bottom raised from 12% to 22% opacity; focus state to 70%. Input boundaries are now visible without looking like traditional form fields.
4. **Font weight on card numbers:** `font-thin` (weight 100) changed to `font-light` (weight 300) on BatteryHealthCard, ScoresCard, TirePressureCard, WeatherRangeCard numeric readouts. Dashboard hero SOC stays `font-thin` (large text, readable).
5. **PriceCurveChart Y-axis unit label:** YAxis now shows `ct/kWh` label so users know the unit without reading the tooltip.
6. **CollapsibleSection tap target:** ChevronDown icon `size-3` → `size-4`; toggle button gets `min-h-[36px]` to meet 44px-class tap target guidelines.

**How to use:** Automatic — all changes are in UI components with no API or configuration changes.

**Key files:** `src/app/globals.css`, `src/app/(dashboard)/settings/settings-client.tsx`, `src/components/vehicle/StatsGrid.tsx`, `src/components/vehicle/BatteryHealthCard.tsx`, `src/components/vehicle/ScoresCard.tsx`, `src/components/vehicle/TirePressureCard.tsx`, `src/components/vehicle/WeatherRangeCard.tsx`, `src/components/vehicle/DepartureCard.tsx`, `src/components/vehicle/DoorsWindowsCard.tsx`, `src/components/vehicle/SentryDashcamCard.tsx`, `src/components/vehicle/SoftwareCard.tsx`, `src/components/energy/PriceCurveChart.tsx`, `src/components/auth/LoginForm.tsx`, `src/components/layout/Sidebar.tsx`.

**Dependencies:** None new.

---

## Playwright E2E Test Scaffold

**What it does:** End-to-end test suite covering auth, garage, costs, and trip planner flows. Smoke tests (no credentials needed) verify public page rendering and auth redirects in CI on every push. Authenticated tests are gated behind `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` and skipped when those env vars are absent.

**How to use:** `npm run test:e2e` — runs all Playwright tests against a locally running app (`npm run start`). Override the target with `PLAYWRIGHT_BASE_URL=https://...`. In CI, `e2e-smoke` job in `.github/workflows/ci.yml` runs only `smoke.spec.ts` (no credentials required).

**Key files:**
- `playwright.config.ts` — Playwright config, `testDir: ./e2e`, single Chromium project, webServer wiring
- `e2e/smoke.spec.ts` — public pages: login form renders, pricing tiers visible, unauthenticated redirect
- `e2e/auth.spec.ts` — login/register form rendering, invalid credentials, successful login redirect
- `e2e/garage.spec.ts` — Add vehicle modal, form fields, submit → "Vehicle added!" confirmation
- `e2e/costs.spec.ts` — costs page load, KPI chips, FAB for document upload
- `e2e/trip.spec.ts` — trip page load, origin/destination inputs, Plan route button
- `e2e/authed-flow.spec.ts` — full end-to-end: login → garage (integration smoke)
- `e2e/helpers/auth.ts` — `loginAs(page, email, password)` helper used by all authenticated specs

**Dependencies:** `@playwright/test ^1.60.0` (already in devDependencies). Run `npx playwright install --with-deps chromium` once to download the browser binary.

---

## Display Currency Conversion (user-selected currency everywhere)

**What it does:** All money shown in the UI is converted to the user's preferred currency (Settings → Currency, stored in `profiles.display_currency`). Storage stays canonical — costs in RON, trip/charging estimates in EUR — and conversion happens only at render time via BNR exchange rates. Until rates load (or if BNR is unavailable), amounts fall back to their canonical currency so a number is never shown with the wrong symbol. Subscription prices on `/pricing` remain in EUR (Stripe-billed).

**How to use:** Pick a currency in Settings. Covered surfaces: costs KPI chips + monthly chart tooltip, trip planner (summary chips, variant chips, stop cards, station detail, fuel comparison), map sheet route summary, charging history, smart-charge savings.

**Key files:**
- `src/app/api/exchange-rates/route.ts` — auth + rate-limited; returns `{ display, ronPerEur, ronPerDisplay }` from the user's profile + BNR cache
- `src/hooks/useCurrency.ts` — `fromRON(amount)` / `fromEUR(amount)` formatters in the user's currency
- `src/lib/currency/format.ts` — `formatMoney` gained optional `maxFractionDigits` (chart tooltips use 0, cost/km uses 3)
- Display call sites: `costs-client.tsx`, `trip-client.tsx`, `map-client.tsx`, `charging-client.tsx`, `CostSummary.tsx`, `StopCard.tsx`, `StationDetailSheet.tsx`, `SmartChargeCard.tsx`

**Dependencies:** `getExchangeRate` (BNR client, `exchange_rates` cache table), `usePreferences` currency picker (migration 008).

---

## Map Detail Sheets Above Bottom Sheet (z-index fix)

**What it does:** Station/stop detail sheets (`StationDetailSheet`, `ChargerDetailSheet`) now open as true modals above the map's main bottom sheet. Previously they rendered at `z-[500]` under the sheet (`z-[900]`), so on mobile the detail card appeared trapped behind the planner and its tap-to-dismiss backdrop was unreachable.

**How to use:** Tap any charging stop or station on `/map` — the detail card slides up over everything; tap the backdrop, the X, or press Escape to close.

**Key files:** `src/components/trip/StationDetailSheet.tsx`, `src/components/charging-map/ChargerDetailSheet.tsx` (backdrop `z-[1090]`, sheet `z-[1100]`).

**Dependencies:** None new.

---

## Settings Rows: Single-Label Layout (display fix)

**What it does:** Language, Display currency, and Install-app rows in Settings now use the expanded layout (label on top, control below) instead of the compact horizontal row. Previously the compact row showed the label on the left while the picker control rendered its *own* label + description on the right — a duplicated label, and the left one was clipped ("M…", "Instalează a…"). The pickers no longer render a duplicate label (the row provides it; the `<select>` keeps an `aria-label` for accessibility). Expanded-row vertical padding nudged up (`py-2.5` → `py-3.5`) so the whole section breathes.

**How to use:** Settings → Preferences. Each preference shows one clear label, a short description, and a full-width control.

**Key files:** `src/app/(dashboard)/settings/settings-client.tsx`, `src/components/settings/LocalePicker.tsx`, `src/components/settings/CurrencyPicker.tsx`, `src/components/pwa/InstallAppButton.tsx`.

**Dependencies:** None new.

---

## Map Collapsed Sheet: Explore/Plan Tabs No Longer Clipped

**What it does:** On `/map`, the collapsed bottom sheet's Explore/Plan tabs were rendering below the visible peek window and spilling into the floating bottom-nav zone, so they appeared cut off. The collapsed peek height is now tall enough to show the handle, summary strip, and both tabs above the nav (`PEEK` 68 → 132). The two sources of truth for collapsed height (`PEEK`/`PEEK_SUMMARY` and `sheetStateToH`) are unified so taps and drags agree. In Plan mode the redundant collapsed summary strip is suppressed — the richer route summary (time · km · cost) already serves as the peek.

**How to use:** Open `/map`; the collapsed sheet shows the Explore/Plan tabs clearly. Tap a tab to switch, tap the handle to expand.

**Update (round 3):** Plan mode *before* a route is computed has no summary strip — only the handle and tabs — so the fixed `PEEK = 132` left ~40px of empty panel background hovering above the floating nav. A third peek height `PEEK_TABS = 96` now applies in that case (`peekH = mode === "plan" ? (plan ? PEEK_SUMMARY : PEEK_TABS) : PEEK`), removing the dead space. Explore (132) and plan-with-route (152) are unchanged.

**Key files:** `src/app/(dashboard)/map/map-client.tsx`.

**Dependencies:** None new.

---

## Cross-Device Polish (P0/P1 bug fixes)

**What it does:** Batch of fixes identified through a 25-persona cross-device audit covering iOS Safari, Android Chrome/Firefox, and desktop browsers.

**Fixes included:**

1. **Number formatting per locale** (`src/lib/currency/format.ts`): `formatMoney`, `formatMoneyCompact`, and `formatKwh` now use the correct IETF locale for each app language — `de-DE` (German), `fr-FR` (French), `hu-HU` (Hungarian), `ro-RO` (Romanian), `en-GB` (English). Previously all non-Romanian users got English-style formatting (dots as decimals).

2. **Pull-to-refresh overscroll** (`src/hooks/usePullToRefresh.ts`): Sets `document.body.style.overscrollBehavior = "contain"` while the hook is active, preventing the native browser pull-to-refresh from firing simultaneously with the custom gesture on iOS Safari and Android Chrome.

3. **`<select>` cross-browser styling** (`CurrencyPicker.tsx`, `LocalePicker.tsx`, `ScenarioPicker.tsx`, `TopBar.tsx`): All `<select>` elements now use `appearance-none` + an absolute-positioned `ChevronDown` icon, so the glass-UI style applies consistently on iOS Safari (which overrides native select styling otherwise), Android, and desktop.

4. **`GettingStartedCard` step_explore** (`src/components/onboarding/GettingStartedCard.tsx`): The "Explore the demo" step is now conditional — only shown for users with a mock vehicle, and marked as done immediately (they've already set up the demo). Previously it was always shown and always undone, so the card could never auto-dismiss for real-vehicle users who completed the other 3 steps.

5. **Firefox PWA hint** (all 5 locale files, `pwa.unsupported_hint`): Updated from the vague "Use your browser menu to install" (implying Firefox can install PWAs from a menu, which it can't) to "Open in Chrome or Edge to install Flux as an app" — actionable for users who arrived via Firefox.

6. **Session expiry redirect** (`src/lib/api-fetch.ts`): On client-side 401 responses, `apiFetch` now redirects to `/login` instead of throwing an unhandled error, ensuring expired sessions don't leave the user on a broken page.

**Key files:** `src/lib/currency/format.ts`, `src/hooks/usePullToRefresh.ts`, `src/components/settings/CurrencyPicker.tsx`, `src/components/settings/LocalePicker.tsx`, `src/components/settings/ScenarioPicker.tsx`, `src/components/layout/TopBar.tsx`, `src/components/onboarding/GettingStartedCard.tsx`, `src/lib/api-fetch.ts`, `src/lib/i18n/locales/*.json`.

**Dependencies:** None new.

---

## Cross-Device Polish Round 2 (P26–P45 bug fixes)

**What it does:** Second batch of UX fixes from a 25-persona audit (P26–P45) covering remaining `<select>` elements, network error handling, and input validation.

**Fixes included:**

1. **`<select>` appearance-none — remaining elements** (`src/app/globals.css`, `src/app/(dashboard)/energy/energy-client.tsx`, `src/app/(dashboard)/settings/tariff-provider-picker.tsx`, `src/app/(dashboard)/trip/trip-client.tsx`, `src/app/(dashboard)/map/map-client.tsx`): Every remaining `<select>` in the app now uses `appearance-none` + a ChevronDown indicator, eliminating the native iOS/Android picker arrow that conflicted with the glass UI. The `auth-input` CSS class also gains a CSS SVG fallback via `select.auth-input` in globals.css for the onboarding model/year dropdowns.

2. **Trip planner offline error** (`src/app/(dashboard)/map/map-client.tsx`, all 5 locale files `trip.network_error`): When route planning fails due to no internet (`!navigator.onLine` or `message === "Failed to fetch"`), the user now sees a translated "No internet connection. Check your network and try again." message instead of the raw `Failed to fetch` JS error or the misleading "Route may be too long" infeasibility hint.

3. **Nickname max length** (`src/components/onboarding/AddVehicleModal.tsx`): The nickname input now enforces `maxLength={50}` at the HTML level, matching the server-side validation, so users on mobile can't accidentally type overlong names before submitting.

**Key files:** `src/app/globals.css`, `src/app/(dashboard)/energy/energy-client.tsx`, `src/app/(dashboard)/settings/tariff-provider-picker.tsx`, `src/app/(dashboard)/trip/trip-client.tsx`, `src/app/(dashboard)/map/map-client.tsx`, `src/components/onboarding/AddVehicleModal.tsx`, `src/lib/i18n/locales/*.json`.

**Dependencies:** None new.

---

## Cross-Device Polish Round 3 (P46+ data & correctness fixes)

**What it does:** Third persona-audit batch. This sub-section covers the data/correctness fixes; the error-handling and accessibility slices are documented in the two sections that follow.

**Fixes included:**

1. **Charging cost shown for RON users** (`src/app/(dashboard)/charging/charging-client.tsx`): the history rows read only `cost_eur`, which is null for nearly all users (mock sessions, OCR, and non-EUR Tesla syncs never populate it). The row now prefers `cost_ron` (`fromRON`) and falls back to `cost_eur`, so the Romanian-majority audience finally sees per-session cost.

2. **Charging history date respects app locale** (`src/app/(dashboard)/charging/charging-client.tsx`): date was formatted with the browser-default locale; now uses the next-intl `useLocale()` value for consistency with the rest of the UI.

3. **SmartChargeCard cache-key drift** (`src/components/energy/SmartChargeCard.tsx`): queried `["vehicle-state", id]` while the rest of the app (and command invalidation) uses `["vehicle", id]`. Aligned so the card's SOC/charge-limit/plugged state updates immediately after any command instead of waiting out its stale time.

4. **Exchange-rate zero guard** (`src/lib/external/bnr/client.ts`): a cached `exchange_rates` row with `rate_to_ron === 0` was treated as valid, producing `Infinity`/`∞` in conversions. Now only truthy rates short-circuit the cache lookup.

5. **OCR confidence NaN guard** (`src/lib/costs/processor.ts`): if a parsed document was missing `confidence.cost_total`/`document_type`, `Math.min(NaN, …)` made `criticalConfidence < threshold` false and silently marked the doc `done` instead of `needs_review`. Missing confidences now default to 0.

**Key files:** `src/app/(dashboard)/charging/charging-client.tsx`, `src/components/energy/SmartChargeCard.tsx`, `src/lib/external/bnr/client.ts`, `src/lib/costs/processor.ts`.

**Dependencies:** None new.

---

## Cross-Device Polish Round 3 — Error Handling & Feedback

**What it does:** Makes every failable mutation surface a clear, localized message instead of a raw error, a silent no-op, or a white screen.

**Fixes included:**

1. **Vehicle commands** (`src/hooks/useVehicleCommand.ts`, `src/app/api/vehicles/[vehicleId]/commands/route.ts`): the mutation now checks `res.ok`, parses defensively (no more "Unexpected token <" toast on an HTML 5xx), redirects to `/login` on 401 like every `apiFetch` caller, and maps failures to stable i18n keys (`commands.error_rate_limit`, `error_vcp_required`, `error_not_supported`) so raw Tesla Fleet API text never leaks. HTTP-200 `success:false` rejections still surface the car-provided reason.

2. **Charging-history sync** (`src/app/(dashboard)/charging/charging-client.tsx`, `charging.syncError`): the manual "Sync from Tesla" button now shows an error toast on failure instead of just stopping the spinner with no feedback.

3. **Vehicle deactivation** (`src/components/garage/VehicleCardMenu.tsx`, `garage.deactivate_error`): the previously-swallowed catch now shows an error toast.

4. **Document inline edit** (`src/app/(dashboard)/costs/costs-client.tsx`, `costs.edit_success`/`edit_error`): edits were fire-and-forget; they now report success and failure like delete already did.

5. **Root crash boundary** (`src/app/global-error.tsx`, new): catches errors thrown in the root layout (which `error.tsx` cannot) and renders a minimal reload screen instead of a white page. English-only by necessity — it runs outside the i18n provider.

**Key files:** `src/hooks/useVehicleCommand.ts`, `src/app/api/vehicles/[vehicleId]/commands/route.ts`, `src/app/(dashboard)/charging/charging-client.tsx`, `src/components/garage/VehicleCardMenu.tsx`, `src/app/(dashboard)/costs/costs-client.tsx`, `src/app/global-error.tsx`, `src/lib/i18n/locales/*.json`.

**Dependencies:** None new.

---

## Cross-Device Polish Round 3 — Accessibility

**What it does:** Closes the recurring a11y gaps a screen-reader / keyboard / motor-impaired user hits across the app (90% mobile). Four root-cause patterns fixed: icon-only buttons relying on `title`, inline errors without `role="alert"`, number inputs without `min`, and tap targets under 44px.

**Fixes included:**

1. **Bottom sheets** (`StationListSheet.tsx`, `SlideUpMenu.tsx`): Escape-to-close + the station sheet gains an `aria-label`; the "More" menu close button goes 32px→44px.
2. **Inline error live regions** (`DocumentStatusCard.tsx`, `AddVehicleModal.tsx`, `WhatsAppPhonePicker.tsx`, `HomeLocationPicker.tsx`): error `<p>`s now carry `role="alert"`; the phone input also gets `aria-invalid`.
3. **Select labels** (`ScenarioPicker.tsx`, `tariff-provider-picker.tsx`): both dropdowns gain `aria-label` (matches CurrencyPicker/LocalePicker).
4. **Number inputs** (`DocumentStatusCard.tsx`): cost/kWh get `min="0"`; non-positive values are ignored on submit. Date also localized (was hardcoded `ro-RO`).
5. **Tap targets** (`CommandPanel.tsx` 36px→44px incl. skeleton, `AddVehicleModal.tsx` close/clear, `GeocodingSearch.tsx` clear/locate padded + `aria-label`).
6. **Collapsible sections** (`settings-client.tsx`, `InactiveVehiclesList.tsx`): `min-h-[44px]` + `aria-expanded`; inactive vehicle names get a `title` tooltip.
7. **Onboarding page dots** (`OnboardingOverlay.tsx`): now interactive `<button>`s (jump to screen) with `aria-label`/`aria-current` and a 32px hit area.
8. **i18n labels** (`UpgradeButton.tsx`): default label was hardcoded English; now falls back to `common.upgrade`. New keys `common.upgrade`, `common.clear`, `onboarding.add_vehicle.clear_vin`.

**Key files:** the components above + `src/lib/i18n/locales/*.json`.

**Dependencies:** None new.

---

## Deferred Fixes Batch — OCR Timeout, GeocodingSearch ARIA, Map Mid-State

**What it does:** Three targeted fixes from the round-3/4 deferred list.

### 1. OCR processing timeout surfaced to users

Stuck documents (status `"processing"` or `"pending"` for > 5 minutes) are mapped to `status:"error"` with `error_message:"processing-timeout"` in the GET `/api/documents` response. `DocumentStatusCard` translates this key via `friendlyErrorKey → "timeout"` → locale key `costs.docStatus.friendlyError.timeout`.

**Key files:** `src/app/api/documents/route.ts`, `src/components/costs/DocumentStatusCard.tsx`, locale files.

### 2. GeocodingSearch keyboard navigation + combobox ARIA

The location search input now supports full keyboard navigation: ArrowDown/ArrowUp move the active option, Enter selects it, Escape closes the dropdown. The input carries `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete`, and `aria-activedescendant`. The listbox has `role="listbox"` and each option has `role="option"` with `aria-selected`.

**Key files:** `src/components/trip/GeocodingSearch.tsx`.

### 3. Map Plan-mode mid-snap dead space

In plan mode before a route is computed, the mid-state sheet snap was a fixed 44% of viewport height. On tall phones (>= ~860px) the plan form content (two location inputs + SOC sliders + vehicle picker + button + 90px bottom padding ≈ 360px) is shorter than 44vh, leaving a visible dark gap inside the sheet. Fix: the mid snap in plan-no-route mode now uses `MID_PLAN_H = 460px` (capped at 75% for small screens), which matches or slightly overflows the form content on all modern phone sizes.

**Key files:** `src/app/(dashboard)/map/map-client.tsx` (`MID_PLAN_H` constant, `sheetStateToH`, `initialSnapH`).

**Dependencies:** None new.

---

## Billing & GDPR Fixes

**What it does:** Fixes silent GDPR data export gaps and surfaces checkout errors to the user.

**Fixes included:**

1. **GDPR export data** (`src/app/api/user/export/route.ts`): `charging_sessions`, `command_events`, and `energy_costs` have no `user_id` column — they are owned through `vehicles`. The previous query used `vehicles!inner(user_id)` with `.eq("vehicles.user_id", userId)` which returns no data via the admin client (RLS bypassed). Fixed by fetching the user's vehicle IDs first, then filtering child tables with `.in("vehicle_id", vehicleIds)`. Also removed the stale `profiles?.email` reference (profiles table has no email column).

2. **Checkout error toast** (`src/components/billing/UpgradeButton.tsx`): replace `console.error` with `toast.error(tc("checkout_error"))` from sonner. Missing i18n key `checkout_error` added to all 5 locale files.

3. **ManageSubscriptionButton i18n** (`src/components/billing/ManageSubscriptionButton.tsx`): replace hardcoded "Manage subscription" with `tc("manage_subscription")`. Missing i18n key `manage_subscription` added to all 5 locale files.

**How to use:**
- GDPR export: `GET /api/user/export` (requires auth, rate-limited to 5/period)
- Checkout: `POST /api/billing/checkout` body `{ tier: "pro" | "pro_annual" }`
- Subscription portal: `POST /api/billing/portal`

**Key files:** `src/app/api/user/export/route.ts`, `src/components/billing/UpgradeButton.tsx`, `src/components/billing/ManageSubscriptionButton.tsx`, `src/lib/i18n/locales/*.json`.

**Dependencies:** sonner (toast), next-intl (i18n).

---

## Domain Math Fixes — Tariffs, Costs, Trip Planner

**What it does:** Corrects six domain/math bugs that produced silently wrong numbers in three features.

**Fixes:**

1. **Overnight loop in smart charge recommendation** (`src/lib/external/tariffs/recommend.ts` — `findCheapestWindow`): The old algorithm also scanned hours 0..fromHour, so early-morning hours that had already passed today were recommended as "future" windows. Fixed by only iterating `fromHour..ceiling` (no backward scan).

2. **Departure-time constraint in `computeSmartCharge`** (same file): The algorithm previously picked the globally cheapest window regardless of when the user needs the car. Added `departureHour` parameter forwarded as `beforeHour` to `findCheapestWindow`, so windows starting at or after departure are excluded.

3. **kWh inconsistency in costs route** (`src/app/api/costs/route.ts`): `homeKwh` used `vehicle_kwh_attributed ?? 0` (dropping rows with only `total_kwh`) while `publicKwh` used `total_kwh ?? 0` (ignoring attributed). Both now use `vehicle_kwh_attributed ?? total_kwh ?? 0` — consistent across home and public rows.

4. **`whPerKm` unit label** (`src/app/(dashboard)/costs/costs-client.tsx`): KPI chip showed "Wh" instead of "Wh/km". Corrected the inline unit string.

5. **Trip planner detour undercount** (`src/lib/external/routing/planner.ts`): Detour cost was multiplied by `0.3` (neither a round-trip nor a sensible approximation) instead of `2` (to-station + back-to-route). Both `segmentKm` and `remainingNeededPct` now use `detourKm * 2`.

6. **Hardcoded petrol price** (`src/app/api/costs/route.ts`): `PETROL_PRICE_RON = 7.5` is a static Romanian national average approximation. Added comment explaining BNR does not provide fuel prices and this figure is not shown as a live market rate.

**How to use:** No API or UI changes required — fixes are internal to the computation path. Affected endpoints: `GET /api/tariffs/prices` (smart charge), `GET /api/costs` (kWh/unit label), `POST /api/trip-plan` (detour factor).

**Key files:** `src/lib/external/tariffs/recommend.ts`, `src/app/api/costs/route.ts`, `src/app/(dashboard)/costs/costs-client.tsx`, `src/lib/external/routing/planner.ts`.

**Dependencies:** None new.

## Auth / Billing — UUID-Scoping Consistency, Checkout Feedback, Upsert Error Check

**What it does:** Three bug fixes around user-id scoping and Stripe checkout.

1. **Consistent Supabase UUID scoping** — Some routes filtered Supabase queries with the raw `session.user.id` (which on first OAuth sign-in is Google's numeric `sub`, not the Supabase `auth.users` UUID stored in `vehicles.user_id` / `user_settings.user_id`). Those queries silently returned/affected no rows. Now resolved through `ensureSupabaseUserId(session)` before any DB filter. Fixed routes: `GET/PUT /api/tariffs/settings`, `GET /api/tariffs/prices` (`user_settings`), and `PATCH/DELETE /api/vehicles/[vehicleId]` (`vehicles`).
2. **Post-checkout success feedback** — After Stripe checkout the user returns to `/settings?checkout=success` but nothing was shown. `SettingsClient` now shows a `toast.success` (i18n key `settings.billing.checkout_success`) and strips the `checkout` param from the URL via `history.replaceState`.
3. **tariffs/settings PUT upsert error check** — The `user_settings` upsert result's `error` was ignored, returning success even on DB failure. Now returns 500 (`Failed to save settings`) when the upsert errors.

**How to use:** No API contract changes. Checkout success banner appears automatically on `/settings` after a successful Stripe subscription.

**Key files:** `src/app/api/tariffs/settings/route.ts`, `src/app/api/tariffs/prices/route.ts`, `src/app/api/vehicles/[vehicleId]/route.ts`, `src/app/(dashboard)/settings/settings-client.tsx`, `src/lib/supabase/ensure-user.ts`, `src/lib/i18n/locales/{en,ro,de,fr,hu}.json`.

**Dependencies:** None new (`sonner` already used for toasts).

---

---

## Map/Planner UX Bug Fixes — Alt-Route Tap Target + Plan Tab Clip

**What it does:** Two bugs found via a personas audit of `/map?mode=plan` and `/map?mode=explore`:

1. **Alt-route tap-area broken on mobile** (`TripMap.tsx`): The two-layer approach (invisible `weight:8, opacity:0` hit-area + thin `weight:3` dashed line) was completely untappable. SVG uses `pointer-events: visibleStroke` by default, so strokes with `stroke-opacity: 0` receive no events. On mobile, users could never switch to an alternative road by tapping the dashed line. Fixed by collapsing into a single wider polyline: `weight:8, opacity:0.28, dashArray:"6 10"` — large enough to tap, subtle enough to look secondary to the active purple route.

2. **Plan/Explore tabs clipped behind BottomNav** (`map-client.tsx`): `PEEK_TABS = 96` was set too low. Measured real tab-zone height: `pt-2.5(10) + min-h-11 handle(44) + mb-2(8) + mt-3 tab margin(12) + tab row(36) + pb-3(12) = 122px`. With only 96px of peek the bottom 26px of the Explore/Plan tabs overflowed behind the floating BottomNav, making them hard to tap. Fixed: `PEEK_TABS = 128`.

**How to use:** Open `/map?mode=plan`, compute a route — alternative roads are now tappable (wider grey dashed bands). Drag the sheet to collapsed in plan-no-route mode — Explore/Plan tabs are now fully visible above the nav.

**Key files:** `src/components/trip/TripMap.tsx`, `src/app/(dashboard)/map/map-client.tsx`.

**Dependencies:** None.

---

## Personas Audit Round 2 — Onboarding, Garage, Settings a11y

**What it does:** Resolves the remaining audit findings around first-run flow and dialog accessibility.

1. **OnboardingOverlay focus trap** (P1 a11y) — The full-screen welcome overlay (`role="dialog"`, covers the whole app) only had Escape + scroll-lock; a keyboard / screen-reader user could Tab to the nav behind it. Now it moves focus into the overlay on open, traps Tab (cycling within), and restores focus to the previously-focused element on close — same pattern as `AddVehicleModal`.

2. **Garage empty-state is demo-first when live is off** (P2 UX) — In the default demo configuration (`LIVE_INTEGRATIONS` unset), the prominent "Connect Tesla" CTA led to `/api/tesla/connect`, which returns **410** — a dead end for brand-new users, while the working "Add demo vehicle" was the de-emphasized outline button. The server page now passes `teslaLive = isLiveEnabled("tesla")`; when false, the demo vehicle is the single primary CTA and the dead Tesla-connect button is hidden. When live is enabled, the original two-CTA layout is unchanged.

3. **Settings deactivate now confirms** (P3 consistency) — The Settings vehicle `DeactivateButton` deactivated on a single tap with no confirmation, unlike the garage `VehicleCardMenu` which uses an `AlertDialog`. Settings now uses the same confirmation dialog (reusing the existing `garage.deactivate_confirm_*` keys), with a `toast.error` on failure.

**Key files:** `src/components/onboarding/OnboardingOverlay.tsx`, `src/app/(dashboard)/garage/page.tsx`, `src/app/(dashboard)/garage/garage-client.tsx`, `src/components/settings/DeactivateButton.tsx`.

**Dependencies:** None new.

---

## Personas Audit Round 2 — Charging, Costs, Settings

**What it does:** Fixes the highest-value issues from a second 3-persona × multi-device audit (Ana/iPhone SE/RO, Klaus/Pixel/DE, Bogdan/Samsung/RO, Lena/iPhone mini/DE, Sophie/VoiceOver/FR).

1. **Scheduled charging now persists and reads back** (P1) — Previously `schedule_charging` was a mock no-op and the UI hardcoded `off / 23:00` on every mount, so a saved schedule never survived a reload, and the Save button was gated on `!caps.hasLiveVehicle` — permanently disabled for the 90% demo (mock) users. Now: `VehicleState` carries `scheduledChargingEnabled` + `scheduledChargingStartMinutes`; the mock engine persists them on the command; `/state` returns them (pass through `applyCapabilityMask`); `charging-client` seeds the toggle + time from state; the Save gate is `isPending` only (matching the charge-limit Save). The dormant live Tesla adapter returns `null` for both (mapping is a follow-up).

2. **Receipt amounts/kWh now locale-formatted** (P1) — `DocumentStatusCard` rendered `cost_total.toFixed(2)` / `total_kwh.toFixed(1)` with hardcoded `.` decimals; RO/DE users saw `1234.56` instead of `1.234,56`. Now routed through `formatMoney`/`formatKwh` (with `isCurrency` guard + raw fallback).

3. **`saveSchedule` NaN guard** (P2) — A cleared time input yielded `NaN` minutes; now falls back to 23:00 via `Number.isFinite`.

4. **HomeLocationPicker locale geocoding** (P2) — Nominatim `Accept-Language` was hardcoded `ro,en`, returning Romanian place names to all users; now passes the active locale.

5. **ScenarioPicker stale selection** (P2) — The dropdown only read `currentScenarioId` once; now syncs via a ref-guarded effect when the prop changes.

6. **Slider/Switch a11y** (P3) — The charge-limit `Slider` and scheduled-charging `Switch` had no accessible name; added `aria-label`. The shared `Slider` primitive now forwards `aria-label`/`aria-labelledby` to the Thumb (the element with `role="slider"`), fixing it app-wide.

**Key files:** `src/types/vehicle.ts`, `src/lib/mock/{engine,seed}.ts`, `src/lib/tesla/api.ts`, `src/app/(dashboard)/charging/charging-client.tsx`, `src/components/costs/DocumentStatusCard.tsx`, `src/components/settings/{HomeLocationPicker,ScenarioPicker}.tsx`, `src/components/ui/slider.tsx`, `src/lib/mock/__tests__/engine.test.ts`.

**Dependencies:** None new.

---

## Quality Polish — Plan Feature Refinements

**What it does:** Small correctness fixes on the Wave-3 plan features:

1. **ScenarioPicker success toast** (`ScenarioPicker.tsx`): `toast.success` was showing `settings.scenario.label` ("Demo scenario") as the success message — the label, not a confirmation. Added `settings.scenario.saved` i18n key in all 5 locales and updated the toast to use it.

2. **`usePullToRefresh` dead ref** (`dashboard-client.tsx`, `usePullToRefresh.ts`): `containerRef = useRef<HTMLElement>(null)` was created in the dashboard but never attached (PageWrapper doesn't accept refs). The hook already falls back to `document.querySelector("main")` when the ref is null. Removed the dead ref from the dashboard and made the hook's first parameter accept `null` explicitly.

**Key files:** `src/components/settings/ScenarioPicker.tsx`, `src/hooks/usePullToRefresh.ts`, `src/app/(dashboard)/dashboard/dashboard-client.tsx`, `src/lib/i18n/locales/*.json`.

**Dependencies:** None new.

---

## Note: UUID-scoping — rute GET/command (follow-up cunoscut)

`state`, `charging-history`, `weather`, `battery-health`, `commands`, `trip-plan` folosesc `session.user.id` direct în filtrele `vehicles.user_id`. Acestea NU sunt sparte în practică — JWT callback-ul (`src/lib/auth.ts:68-92`) rezolvă UUID-ul Supabase la sign-in și îl bake-uie în token. `ensureSupabaseUserId` e aplicat doar pe rutele de scriere (tariffs/settings, vehicles PATCH/DELETE) unde consecința unui UUID greșit e mai severă. Extinderea pe `state` (polled la 30s) ar adăuga un round-trip admin.getUserById pe cel mai fierbinte endpoint — nerecomandat fără un cache de sesiune dedicat.

---

## Insights Page (`/insights`)

**What it does:** A single analytics page aggregating 4 data dimensions across a user-selectable period (7d / 30d / 1y / all time):

1. **Savings & CO₂** — Total RON saved vs. equivalent petrol car (7 L/100 km × 7.5 RON/L), litres of fuel avoided, kg CO₂ avoided (2.36 kg/L petrol), and tree-equivalents (21 kg CO₂/tree/year). Derived from `/api/costs` (existing).

2. **Activity** — Total km driven, drive time (hours), trip count, kWh charged. Monthly mileage bar chart (last 12 months).

3. **Battery health** — Current State-of-Health % (from `battery_health_history` or live `batteryHealthPct`), SoH sparkline over time, vampire drain (% / h while parked, computed from `vehicle_snapshots` consecutive deltas).

4. **Efficiency** — Average Wh/km (from `trips.energy_used_kwh`), Wh/km by temperature bucket (<0°C, 0–10°C, 10–20°C, 20–30°C, >30°C, correlated with `vehicle_snapshots`), projected range from current `batteryRangeKm`.

**How to use:** Navigate to `/insights` (or via Sidebar / mobile "More" sheet). Period selector in the header filters all sections.

**Key files:**
- `src/app/(dashboard)/insights/page.tsx` — server page (vehicleId resolution)
- `src/app/(dashboard)/insights/insights-client.tsx` — client UI with 4 sections
- `src/app/api/vehicles/[vehicleId]/stats/route.ts` — new endpoint (trips + charging + snapshots)
- `src/hooks/useStats.ts` — TanStack Query hook for stats API
- `src/components/layout/Sidebar.tsx` + `SlideUpMenu.tsx` — nav entry added

**Dependencies:** `/api/costs` (savings), `/api/vehicles/[vehicleId]/battery-health` (existing), `/api/vehicles/[vehicleId]/stats` (new), `/api/vehicles/[vehicleId]/state` (projected range). Empty states shown gracefully when tables have no data (new mock users).

**Mock data pipeline (so insights aren't hollow for the default mock user):** The Tier-3 simulator now feeds the analytics tables it previously left empty:

- **`trips.energy_used_kwh` + `efficiency_kwh_per_100km`** — computed on trip close in `src/lib/mock/persistence.ts` from distance × spec efficiency × a temperature factor (`tempEfficiencyFactor`): 1.0 at the ~15°C sweet spot rising to ~1.6 in deep cold. This powers avg Wh/km and the efficiency-vs-temperature chart.
- **`vehicle_snapshots`** — `maybeRecordSnapshot` writes one row per 10-minute wall-clock bucket (no extra read; bounded growth) capturing battery level, range, odometer, exterior temp, charging flag. Powers vampire drain + temperature correlation + range history.
- **Phantom (vampire) drain** — `engine.ts` parked physics now applies a small standby draw (~0.6%/day) independent of climate, so vampire drain shows a believable rate. Vampire drain in the stats endpoint averages %/h across **all** idle (non-driving, non-charging) windows — including flat ones — so the integer-rounded `battery_level` column doesn't bias the rate upward.
- **`seasonalTempC(lat, date)`** — deterministic seasonal/diurnal temperature, extracted from `mock-weather.ts` and shared by the simulator so snapshot/trip temperatures stay consistent with the weather provider.

`battery_health_history` was already backfilled by `recordBatteryHealth` (called from the state route), so the SoH chart worked from the start.

---

## 24. Trip Planner — Desktop Sidebar & Mobile Compaction

**What:** The `/trip` screen gains a Google-Maps / ABRP-style left sidebar on desktop (lg+) and a more compact mobile layout, matching the pattern already used on `/map`.

- **Desktop (lg+):** the map is offset by the sidebar (`lg:left-[380px] xl:left-[400px]`), and a `<DesktopSidebar title icon={Route}>` shows the planner form plus the results (when a plan exists) in a single scroll region — results are always visible, not gated by `formCollapsed`.
- **Mobile:** the top-left search overlay and the bottom slide-up results panel are unchanged in behavior but hidden on desktop (`lg:hidden`) and visually compacted — `rounded-t-[20px]` panel, slimmer handle (`h-1 w-9 bg-white/25 active:bg-white/40`), and a top sheen (`before:…bg-white/10`).
- The run-on `CostSummary` text-summary block is replaced by the shared `StatStrip` (4 cells: Time / Distance / Stops / Cost, cost accented). Variant chips are a horizontal scroll rail on mobile (`w-[150px]`) and full-width stacked rows on desktop (`lg:w-full lg:flex-row lg:justify-between`).

**How to use:** Visit `/trip`. Resize past the `lg` breakpoint to see the sidebar.

**Key files:**
- `src/app/(dashboard)/trip/trip-client.tsx` — extracted two local presentational components, `TripPlannerForm` (origin/destination + options + plan button) and `TripResultsBody` (variant chips + `StatStrip` + share + stop list), rendered in both the mobile overlay/panel and the desktop sidebar.
- `src/components/map/map-ui.tsx` — reused `DesktopSidebar`, `StatStrip` / `Stat`.

**i18n:** added `trip.stat_time`, `trip.stat_distance`, `trip.stat_stops`, `trip.stat_cost` to all 5 locales. Title reuses existing `trip.title`. `CostSummary` is no longer rendered on `/trip` (still used elsewhere).

**Dependencies:** none new — same `POST /api/trip-plan` and `GET /api/chargers`.

---

## 25. Map Mobile — Scroll Fix & Sheet Redesign

**What:** Fixes the Explore bottom-sheet on mobile and modernizes it.

- **Scroll/dead-space bug:** the sheet height derived from `window.innerHeight` (which on iOS Safari includes the area behind the toolbar) and a hand-tuned `peekH` constant, so the expanded station list couldn't scroll and left a dead band. Now `visibleViewportHeight()` prefers `window.visualViewport.height` (refreshed on `visualViewport`/window `resize` + `orientationchange`), and the peek height is **measured** via `ResizeObserver` (`peekRef`/`peekH`) so the scroll area = `snapH − measuredPeek`. A rAF-deferred effect re-anchors the sheet when geometry changes. Scroll container uses `overscroll-contain` + `[touch-action:pan-y]` so drag and scroll don't fight.
- **Collapsed peek** is ~40% shorter: slim grabber + one dense summary line; the Explore/Plan segmented control only renders when expanded.
- **Station list** modernized with the shared `LIST_ROW`/`SECTION_TITLE` vocabulary: availability dot, name + city, right-aligned power chip, chevron, framer-motion stagger on reveal + `whileTap` on rows. `ExploreContent` is shared by the mobile sheet and the desktop sidebar.

**Key files:** `src/app/(dashboard)/map/map-client.tsx`, `src/components/map/map-ui.tsx`.

---

## 26. Dashboard — Charging Card Battery Guard

**What:** `ChargingOverlayCard` rendered `state.batteryLevel` raw, so a corrupted JSONB value could surface as a giant number. Now clamped to `[0,100]` and rounded (matching `HeroCard`). **Key file:** `src/app/(dashboard)/dashboard/dashboard-client.tsx`.

---

## 27. Map Mobile — Top Card + Bottom Results Sheet

**What:** Replaces the old floating filter toggle + separate pills row + 3-state collapsed bottom card with a single **top search/filter card** (Waze/ABRP pattern) plus a 2-state bottom **results-only** sheet.

- **Top card** (`absolute inset-x-3 top-[safe-area+12px] z-[1000] lg:hidden`): compact rounded card anchored to the top. Mode tabs (Explore | Plan) + mode-specific controls. Explore: two compact filter chip rows (`h-7 text-2xs`, power + connector). Plan: origin/destination `GeocodingSearch`, collapsible Advanced (SOC + vehicle), Plan button.
- **Plan-mode form collapse** (`editingRoute` state): after a plan is computed the form collapses to a slim **"Origin → Destination" bar** (tap the pencil to edit again), so the map and route polylines stay visible — Google/Apple Maps pattern. `handlePlan` sets `editingRoute = false`; `switchMode` restores it based on whether a plan exists.
- **Route chooser:** when `variants.length > 1`, a horizontal strip of compact variant chips (`Fastest · 14h`, `Fewest stops · 14h20m`, …) renders **both** under the collapsed "A → B" bar (pick a route without leaving the map view) and at the top of the results sheet. Alternative route polylines are also tappable on the map (`onRouteSelect → handleRouteSelect`).
- **Bottom results sheet** (mobile only): appears via `AnimatePresence` only when there are results — `stations.length > 0` for Explore, `plan !== null` for Plan. Snaps between mid (~45 vh) and full (~88 vh). No collapsed state (the top card is the control surface). Draggable.
- **Desktop:** unchanged — left `DesktopSidebar` with `PlanContent` (full form + results).
- **Eliminated:** dark void below content, "get address" button overlapping card, misaligned colors, gradient that dimmed map markers, planner form covering the map after planning.

**How to use:** Open `/map` on mobile. Explore: filter chips in the top card, station list slides up from the bottom. Plan: enter origin/destination, tap "Plan route" — the form shrinks to an "A → B" bar, results slide up from the bottom, and route chips let you switch between alternative routes.

**Key files:** `src/app/(dashboard)/map/map-client.tsx`, `src/lib/i18n/locales/*.json` (new `trip.advanced_label`).
