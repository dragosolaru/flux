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

**What:** Map of ~50 real-world EU charging stations (IONITY, Tesla SC, etc.) with network/power/plug filters and availability overlay.

**How to use:** UI `/charging-map` (`StationMap`, Leaflet). API: `GET /api/charging-map` (filter by `network`, `minKw`, `plug`; adds network metadata + availability), `GET /api/charging-stations`.

**Key files:** `src/components/charging-map/StationMap.tsx`, `src/lib/external/charging-networks/stations.ts`, `.../availability.ts`, `.../meta.ts`, `src/app/api/charging-map/route.ts`.

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
