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
| `/energy` | Energy | tariff prices + smart charge timing |
| `/charging-map` | Charging map | station map |
| `/trip` | Trip planner | ABRP-style route + charging stops |
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

**What:** Map of ~70 real-world EU charging stations (IONITY, Tesla SC, EnBW/Renovatio, Fastned, Allego, etc.) including full Romanian coverage (Cluj-Napoca, Sibiu, Brașov, Pitești, Ploiești, Timișoara, Iași, Constanța, Oradea, Craiova + highway IONITY/EnBW/Fastned). Network/power/plug filters and availability overlay.

**How to use:** UI `/charging-map` (`StationMap`, Leaflet). API: `GET /api/charging-map` (filter by `network`, `minKw`, `plug`; adds network metadata + availability), `GET /api/charging-stations` (accepts `lat`, `lng`, `radius` params).

**Fallback behaviour:** `GET /api/charging-stations` first tries OpenChargeMap. On any error (403, network, timeout) it falls back to the static `STATIONS` dataset filtered by haversine distance within the requested radius. No error is returned to the client.

**i18n:** `chargingMap.disclaimer` key present in all 5 locales — shown as attribution text on the map page.

**Key files:** `src/components/charging-map/StationMap.tsx`, `src/lib/external/charging-networks/stations.ts`, `.../availability.ts`, `.../meta.ts`, `src/app/api/charging-map/route.ts`, `src/app/api/charging-stations/route.ts`.

**Dependencies:** Leaflet/react-leaflet. Station data is a **static seeded dataset**; availability is simulated.

---

## 10. Trip planner

**What:** ABRP-style planner: routes origin → destination, inserts charging stops when range (weather-derated) runs low, and shows cost + petrol comparison. Uses a 10% safety reserve and 80% default charge target.

**How to use:** UI `/trip` (`GeocodingSearch`, `TripMap`, `TripPlanResult`, `StopCard`, `CostSummary`, `TripComparison`). API: `POST /api/trip-plan` (vehicle/origin/SOC/destination → `planTrip`), `GET /api/geocode` (Nominatim search, edge runtime).

**Key files:** `src/app/api/trip-plan/route.ts`, `src/lib/external/routing/planner.ts`, `src/lib/external/routing/providers/osrm-router.ts`, `src/app/api/geocode/route.ts`, `src/components/trip/*`.

**Dependencies:** OSRM (`router.project-osrm.org`, 5s timeout with haversine×1.25 fallback), Nominatim (geocoding), Leaflet, mock weather derating, static station dataset, model specs (`src/lib/brands/models.ts`).

---

## 11. Settings

**What:** Preferences (locale, currency), home location, tariff provider, WhatsApp phone, billing controls, and account danger zone (export / delete).

**How to use:** UI `/settings`. API: `GET/PATCH /api/me/preferences`, `GET /api/user/export` (GDPR export), `DELETE /api/user/delete` (account deletion), `GET/POST /api/tariffs/settings`.

**Key files:** `src/app/(dashboard)/settings/page.tsx`, `src/app/(dashboard)/settings/danger-zone.tsx`, `src/components/settings/*` (CurrencyPicker, HomeLocationPicker, LocalePicker, WhatsAppPhonePicker), `src/app/api/user/*`.

**Dependencies:** Supabase. `/about-data` is a companion read-only transparency page.

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
- `BottomNav` — updated to use `backdrop-blur-2xl` and a pill background indicator.

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
