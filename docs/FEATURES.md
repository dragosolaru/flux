# FEATURES — Flux Feature Catalog

> Fast-onboarding map of what Flux does, where each feature lives, and what it depends on.
> Flux is a Next.js SaaS for EV owners (Tesla-first): live vehicle state, remote commands, AI cost tracking, a per-vehicle document vault, energy tariffs, a charger map, and trip planning.
>
> For architecture and data flows read `CODEBASE_CONTEXT.md`. For third-party wiring read `docs/SYSTEMS.md`. For the OCR pipeline read `docs/COST-INTELLIGENCE.md`.

**Live vs mock:** Almost everything runs against a mock simulator by default. Live Tesla integration is gated by the `LIVE_INTEGRATIONS` env var (`isLiveEnabled("tesla")` in `src/lib/live-integrations.ts`). With it unset, vehicle state, commands, and charging history are served by the mock engine, and the `/api/tesla/*` routes return **410**. The Tesla Fleet API code is in-tree but dormant (see `docs/VEHICLE-CONNECTION.md`).

---

## Contents

- [Stack](#stack)
- [App map](#app-map)
- [1. Authentication](#1-authentication)
- [2. Vehicles / Garage](#2-vehicles--garage)
- [3. Dashboard (live vehicle state)](#3-dashboard-live-vehicle-state)
- [4. Charging](#4-charging)
- [5. Commands (remote control)](#5-commands-remote-control)
- [6. Costs & OCR](#6-costs--ocr)
- [7. Document ingestion (email + WhatsApp)](#7-document-ingestion-email--whatsapp)
- [8. Per-vehicle Document Vault](#8-per-vehicle-document-vault)
- [9. Energy & tariffs](#9-energy--tariffs)
- [10. Charger Data Platform (PostGIS)](#10-charger-data-platform-postgis)
- [11. Charging map](#11-charging-map)
- [12. Trip planner](#12-trip-planner)
- [13. Unified Map (`/map`)](#13-unified-map-map)
- [14. Insights](#14-insights)
- [15. Settings](#15-settings)
- [16. Billing / subscription](#16-billing--subscription)
- [17. Multi-channel notifications](#17-multi-channel-notifications-feature-flagged)
- [18. Display currency conversion](#18-display-currency-conversion)
- [19. Internationalization (i18n)](#19-internationalization-i18n)
- [20. PWA (installable app)](#20-pwa-installable-app)
- [21. Public pages (landing + product)](#21-public-pages-landing--product)
- [22. Design system & UX foundation](#22-design-system--ux-foundation)
- [23. Platform endpoints & infra](#23-platform-endpoints--infra)
- [24. Security hardening](#24-security-hardening)
- [25. Testing](#25-testing)

---

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16.2.6 (App Router) | `after()` for background work; `src/proxy.ts` (Proxy convention, not `middleware.ts`) |
| Language | TypeScript strict | no `any` |
| UI | React 19 | |
| Auth | NextAuth (Auth.js) v5 | Google OAuth + email/password credentials; JWT sessions |
| Database | Supabase (Postgres + RLS + PostGIS) | admin client server-side only |
| Storage | Supabase Storage | private `documents` bucket |
| Client state | TanStack Query v5 | vehicle state polling, all data hooks |
| i18n | next-intl v4 | 5 locales: `ro` (default), `en`, `de`, `fr`, `hu` |
| Styling | Tailwind CSS v4 + shadcn/ui | dark-only theme (`forcedTheme="dark"`) |
| AI / OCR | Anthropic Claude (`@anthropic-ai/sdk`) | `claude-sonnet-4-6` vision; **only `ANTHROPIC_API_KEY`** |
| Payments | Stripe (`stripe` v22) | checkout, portal, webhooks |
| Maps | Leaflet + react-leaflet (+ markercluster) | charger map, trip map |
| Push | `web-push` | VAPID web push notifications |

**External services:** Anthropic Vision (OCR), Stripe (billing), Supabase (DB/storage), Cloudmailin (inbound email), WhatsApp media inbound, OSRM / ORS / TomTom (routing), Nominatim + Photon (geocoding), Open-Meteo (weather), BNR (RON exchange rates), Tibber (optional live tariffs), OpenChargeMap / Overpass / BNetzA / NDW / IRVE / Austria ArcGIS / TomTom / ChargePrice (charger data), Resend + Twilio (notification channels), Tesla Fleet API (dormant).

---

## App map

Dashboard pages live under `src/app/(dashboard)/` (auth-gated layout):

| Route | Page | Feature |
|-------|------|---------|
| `/dashboard` | Main vehicle dashboard | live SOC, range, location, cards |
| `/garage` | Garage | add / list / deactivate vehicles |
| `/charging` | Charging | charge ring, limit slider, scheduled charging, session history |
| `/commands` | Commands | remote vehicle commands |
| `/costs` | Costs | OCR cost dashboard (Energie + Auto tabs) |
| `/documents` | Documents | per-vehicle document vault |
| `/insights` | Insights | savings, CO₂, activity, battery health, efficiency |
| `/energy` | Energy | tariff prices + smart-charge timing |
| `/charging-map` | Charging map | station map browser |
| `/map` | Unified map | combined trip planner + station browser |
| `/trip` | Trip planner | ABRP-style route + charging stops |
| `/settings` | Settings | locale, currency, home, tariff, vehicles, billing, notifications, account |
| `/about-data` | About your data | privacy / data transparency page |

Public pages outside the dashboard group: `/` (landing), `/pricing` (product), `/login`, `/register`.

Nav: desktop `Sidebar` (sections Vehicle / Costs / Planning + Settings/About); mobile `BottomNav` (Car · Map · Charging · More) with a `SlideUpMenu` "More" sheet for secondary destinations.

---

## 1. Authentication

**What:** Email/password and Google sign-in via NextAuth v5. Sessions are JWT; the JWT callback resolves the Supabase `auth.users` UUID at sign-in and bakes it into the token (bridged by `ensureSupabaseUserId`). Write routes (tariffs settings, vehicle PATCH/DELETE) re-resolve via `ensureSupabaseUserId` for safety.

**How to use:** UI `/login`, `/register`. API: `POST /api/auth/register` (creates Supabase auth user, IP rate-limited 5/hr), `GET/POST /api/auth/[...nextauth]` (NextAuth handlers).

**Key files:** `src/lib/auth.ts`, `src/app/api/auth/register/route.ts`, `src/lib/supabase/ensure-user.ts`, `src/components/auth/LoginForm.tsx`.

**Dependencies:** NextAuth, Google OAuth, Supabase Auth.

---

## 2. Vehicles / Garage

**What:** Add, list, deactivate, and delete vehicles. New vehicles are created in **mock** mode (`data_source: "mock"`) and seeded with an initial snapshot. Free tier is capped at 1 active vehicle (`canAddVehicle`). Deactivation soft-deletes (`is_active = false`) preserving all data; deletion is a hard `DELETE` with confirmation. When `LIVE_INTEGRATIONS` is unset the garage empty state offers "Add demo vehicle" as the single primary CTA (the dead Tesla-connect button is hidden). The Add Vehicle modal includes an optional VIN field — `decodeTeslaVin` parses model/variant/year client-side to auto-fill the dropdowns (VIN is never sent to any API).

**How to use:** UI `/garage` (card `⋮` menu → Deactivate) and Settings → Vehicles (active rows + collapsible inactive list with Reactivate / Delete). API: `GET /api/vehicles` (list, user-scoped; `?include_inactive=true` returns inactive too, with `scenarioId` for mock vehicles), `POST /api/vehicles` (add mock vehicle + seed snapshot), `GET/PATCH/DELETE /api/vehicles/[vehicleId]` (PATCH accepts `is_active` and `scenarioId`; reactivation guarded by `canAddVehicle`).

**Key files:** `src/app/api/vehicles/route.ts`, `src/app/api/vehicles/[vehicleId]/route.ts`, `src/lib/mock/seed.ts`, `src/lib/subscription.ts`, `src/lib/brands/tesla/vin-decoder.ts`, `src/components/onboarding/AddVehicleModal.tsx`, `src/components/garage/VehicleCardMenu.tsx`, `src/components/settings/InactiveVehiclesList.tsx`, `src/hooks/useVehicles.ts`.

**Dependencies:** Supabase. Tesla Fleet API only when a vehicle is connected live.

### Scenario switcher (demo vehicles)

Lets users change a mock vehicle's simulated driving behaviour without losing odometer continuity. On switch the `mock_vehicle_state` row is reseeded from `createInitialSnapshot` while the odometer carries over. Valid scenarios: `commuter`, `weekend-errands`, `road-trip`, `vacation`. API: `PATCH /api/vehicles/[vehicleId]` with `{ scenarioId }` (400 if vehicle is not `data_source === "mock"` or the ID is invalid). Key files: `src/components/settings/ScenarioPicker.tsx`, `src/lib/mock/scenarios.ts`, `src/lib/mock/seed.ts`.

### Global vehicle context

A localStorage-persisted React context (`VehicleContext`, key `flux:selectedVehicleId`) replaces URL-param vehicle switching. Single-vehicle users see only the car name; multi-vehicle users get a switcher in TopBar, Sidebar, and the mobile SlideUpMenu. Selection persists across navigation and refresh. Key files: `src/contexts/vehicle.tsx`, `src/app/(dashboard)/layout.tsx`, plus all page clients that read `selectedVehicleId`.

---

## 3. Dashboard (live vehicle state)

**What:** Real-time vehicle state — SOC, range, location, climate, doors/windows, tires, software, scores, battery health, weather-derated range. Polls every 30 s. A "Live" badge dot pulses while a background refetch is in-flight; mobile pull-to-refresh (`usePullToRefresh`, 70 px threshold on the `<main>` scroll container) triggers an immediate refetch. SOC and odometer are clamped/guarded so a corrupt JSONB value renders `—` rather than a giant number; the location chip shows a human-readable city via `mockLocationLabel`. A first-run onboarding overlay (`OnboardingOverlay`, `localStorage["flux-onboarding-v2"]`) and a dismissible getting-started checklist greet new users.

**How to use:** UI `/dashboard`. API: `GET /api/vehicles/[vehicleId]/state` (rate-limited, ownership-checked; live → Tesla `/vehicle_data`, mock → `tick(snapshot)`), plus `GET .../battery-health` and `GET .../weather`.

**Key files:** `src/hooks/useVehicle.ts`, `src/app/api/vehicles/[vehicleId]/state/route.ts`, `src/lib/mock/engine.ts`, `src/hooks/usePullToRefresh.ts`, `src/lib/mock/location-label.ts`, `src/components/vehicle/*` (StatsGrid, BatteryHealthCard, DoorsWindowsCard, TirePressureCard, WeatherRangeCard, ScoresCard, SentryDashcamCard, SoftwareCard, CommandPanel), `src/components/onboarding/{OnboardingOverlay,GettingStartedCard}.tsx`, `src/app/(dashboard)/dashboard/dashboard-client.tsx`.

**Dependencies:** Supabase, Tesla Fleet API (live), mock engine (default), TanStack Query, framer-motion.

### Battery state-of-health API

`GET /api/vehicles/[vehicleId]/battery-health` returns `{ date, sohPct }[]` from `battery_health_history` (ownership-checked). Backfilled by `recordBatteryHealth` (called from the state route). Displayed by `BatteryHealthCard`.

### Weather & range derating API

`GET /api/vehicles/[vehicleId]/weather` returns weather at the vehicle's last-known location and a `derating` object. The model is piecewise-linear, calibrated against real cold-weather data: 15→0°C at −1%/°C; 0→−10°C at −1.5%/°C; below −10°C at −2%/°C. Trip planning uses real Open-Meteo data (section 12); this dashboard endpoint uses the mock weather provider. **Known gap:** no elevation/altitude derating. Key files: `src/app/api/vehicles/[vehicleId]/weather/route.ts`, `src/lib/external/weather/{providers/mock-weather.ts,derating.ts}`.

---

## 4. Charging

**What:** Charge ring (`CircularProgress`), charge-limit slider, scheduled-charging toggle + time, and session history. Charge limit / scheduled charging are issued through the command system (section 5). Scheduled charging persists: `VehicleState` carries `scheduledChargingEnabled` + `scheduledChargingStartMinutes`, the mock engine persists them, and `/state` returns them so the toggle survives reloads (Save gated on `isPending` only — works for mock users). History rows prefer `cost_ron` (converted via `fromRON`) over `cost_eur`, and format dates with the app locale.

**How to use:** UI `/charging` (server passes the 20 most recent `charging_sessions` rows; live state fetched client-side via `useVehicle`). API: `POST /api/vehicles/[vehicleId]/charging-history` (live → `fetchTeslaChargingHistory`, mock → simulated sessions). The manual "Sync from Tesla" button toasts on failure.

**Key files:** `src/app/(dashboard)/charging/{page.tsx,charging-client.tsx}`, `src/app/api/vehicles/[vehicleId]/charging-history/route.ts`, `src/lib/tesla/charging-history.ts`, `src/types/vehicle.ts`.

**Dependencies:** Supabase, Tesla Fleet API (live), `CircularProgress`/`GlassCard` design system.

---

## 5. Commands (remote control)

**What:** Remote commands: lock/unlock, climate on/off + temp, honk, flash, charge limit/amps, start/stop charging, charge port open/close, vent/close windows, sentry on/off, remote start, schedule charging/departure, precondition max, and `share_navigation` (Send to Tesla → maps to Tesla `navigation_gps_request`). Every command is gated on `BrandCapabilities`. `useVehicleCommand` applies optimistic cache updates (lock/unlock, climate, charging, set_charge_limit) with rollback on error, redirects to `/login` on 401, and maps failures to stable i18n keys (`commands.error_rate_limit`, `error_vcp_required`, `error_not_supported`) so raw Tesla Fleet text never leaks.

**How to use:** UI `/commands` and `CommandPanel` on the dashboard. API: `POST /api/vehicles/[vehicleId]/commands` (UUID validate → rate limit → auth → ownership → capability check → live `sendVehicleCommand` or mock `applyCommand`). Adding a command: see the checklist in `CLAUDE.md`.

**Key files:** `src/app/api/vehicles/[vehicleId]/commands/route.ts`, `src/lib/brands/{command-map.ts,tesla/command-map.ts}`, `src/lib/mock/engine.ts`, `src/components/vehicle/CommandPanel.tsx`, `src/hooks/useVehicleCommand.ts`, `src/lib/api/vehicles.ts` (`shareNavigation` helper unifies the share_navigation + optional precondition_max sequence).

**Dependencies:** Tesla Fleet API (live, needs VCP proxy for post-2021 cars), mock engine (default).

---

## 6. Costs & OCR

**What:** Upload or email energy bills / charger receipts. Claude Vision (`claude-sonnet-4-6`) extracts provider, period, kWh, cost, and per-field confidence. Costs are converted to RON (BNR exchange rates), attributed to a vehicle (home-bill share vs public-receipt session match), and aggregated into cost-per-km and a petrol comparison. Confidence below `0.7` flags `needs_review` (missing confidences default to 0). Document types include energy bills, public receipts, **service** and **parking** (no `valid_until`; processor uses `valid_from`/now as the exchange-rate reference). Car-document types route to the vault (section 8) instead of `energy_costs`. The energy-cost creation logic (currency, attribution, session match, insert) is factored into `createEnergyCostRecord(documentId, vehicleId, parsed)` so it can be reused. **Energy receipt uploaded to the vault:** when a `home_bill`/`public_receipt` is uploaded via the document vault (`source: "vault-upload"`) it is NOT added to costs automatically — it is parked (`needs_review`) and the vault shows an "Add to costs?" card; confirming calls `POST /api/vehicles/[vehicleId]/vault/[documentId]/add-to-costs`, which creates the cost (guarded against duplicates) and moves the doc out of the vault. The card also has a "Not now" button that calls `POST /api/vehicles/[vehicleId]/vault/[documentId]/dismiss`, which changes `source` to `"upload"` so the prompt disappears without creating a cost record or deleting the file.

**How to use:** UI `/costs` — split into **Energie** and **Auto** tabs (KPI chips, monthly bar chart, document timeline; FAB toggles the upload card). Manual entry: Auto tab → Add manually → `POST /api/vehicles/[vehicleId]/vault` with `source: "manual"`. API:
- `POST /api/documents` — file upload (10 MB max; processes in background via `after()`); `GET /api/documents` lists with signed URLs (user-scoped + ownership-checked; stuck docs >5 min map to `error: processing-timeout`).
- `GET/DELETE /api/documents/[documentId]`.
- `POST /api/documents/recover` — claim unmatched documents.
- `GET /api/costs` — aggregation (total, home/public split, cost/km, petrol comparison, monthly trend; `homeKwh`/`publicKwh` both use `vehicle_kwh_attributed ?? total_kwh ?? 0`). `GET /api/costs/export` — CSV.

**Constants:** `PETROL_PRICE_RON = 7.5` (static RO national average; BNR has no fuel rate), `PETROL_L_PER_100KM = 7`.

**Key files:** `src/lib/ai/document-parser.ts`, `src/lib/ai/prompts/{document-extraction,car-document-extraction}.ts`, `src/lib/costs/{processor,attribution,session-matcher}.ts`, `src/lib/external/bnr/client.ts`, `src/app/api/costs/route.ts`, `src/app/(dashboard)/costs/costs-client.tsx`, `src/components/costs/{IngestCard,DocumentStatusCard}.tsx`.

**Dependencies:** Anthropic Vision, Supabase Storage, BNR exchange-rate XML.

---

## 7. Document ingestion (email + WhatsApp)

**What:** Each vehicle has an auto-generated inbound email address. Cloudmailin forwards attachments via webhook; the document is stored and queued for OCR. A parallel WhatsApp media webhook feeds the same pipeline.

**How to use:**
- `POST /api/documents/inbound-email` — authenticated by the **`x-webhook-secret` header only** (env `EMAIL_WEBHOOK_SECRET`); fails closed (503) if unset. The `?secret=` query-param fallback was removed. Vehicle resolved by `+subaddress` short-ID → user email local part → sender email → subject nickname; unmatched docs go to `unmatched/` for recovery.
- `POST /api/documents/inbound-whatsapp` — HMAC-secured WhatsApp media ingest. Configured via `WhatsAppPhonePicker` in settings.

**Key files:** `src/app/api/documents/{inbound-email,inbound-whatsapp}/route.ts`, `src/lib/costs/vehicle-email.ts`, `src/lib/costs/processor.ts`.

**Dependencies:** Cloudmailin (also accepts Mailgun / SendGrid multipart), Supabase, Anthropic Vision.

---

## 8. Per-vehicle Document Vault

**What:** Stores any vehicle- or driver-related document per vehicle. Known specific types (RCA & CASCO, ITP, rovinieta, vignettes, bridge/highway tolls, car tax, service, tires, fuel, parking, etc., plus `talon` — permanent / no expiry) are recognised directly. **Everything else is still handled** via a two-field model returned by OCR: a free-text `label` (short human-readable name in Romanian, e.g. "Carte Verde", "TÜV Germania", "Permis de conducere", "Constatare amiabilă") and a `category` for grouping (`insurance`, `registration`, `inspection`, `tax`, `toll`, `operating`, `maintenance`, `financing`, `incident`, `driver`, `other`). This covers EU-wide and driver documents that aren't in the fixed type enum without per-type code changes. Claude Vision OCR also extracts plate, validity dates, issuer, amount, `seria_polita` and `bonus_malus`. Expiry status (days remaining, expired flag) is computed per document. Bank transfers and non-vehicle docs classify as category `other`. Romanian insurer detection includes Grawe, Certasig, Axeria, plus insolvent-insurer flags.

**How to use:** UI `/documents` — vehicle selector; documents are grouped by category (Insurance, Inspection, Registration & papers, Taxes, Tolls, Service, Operating, Financing, Incidents & fines, Driver documents, Other) and sorted with processing docs first then newest-first. Each card shows the type/AI label, expiry status, plate, issuer, view/delete. Upload via the same `POST /api/documents` pipeline (OCR auto-classifies, runs the expert car prompt for vehicle/driver/unknown docs, and writes a `vehicle_doc_meta` row). When OCR returns no type, the client infers a category from filename keywords (shown with a `~` prefix). API: `GET /api/vehicles/[vehicleId]/vault` (returns `VaultDocument[]` with `label` + `category`, ownership-checked, rate-limited 300/hr), `POST /api/vehicles/[vehicleId]/vault` (manual entry), `PATCH /api/vehicles/[vehicleId]/vault/[documentId]` (edit metadata).

**Vault extras (on `/documents`):**
- **Coverage Shield** — SVG progress ring showing % of mandatory RO docs (RCA, ITP, Rovinieta) present and valid; lists missing/expired.
- **Calendar export (ICS)** — `GET /api/vehicles/[vehicleId]/vault/calendar` returns a `text/calendar` file of all expiry dates with 30-day and 7-day alarms.
- **Insolvent-insurer warning** — red banner when a doc was issued by Euroins România or City Insurance (`INSOLVENT_INSURERS`).
- **RCA renewal link** — when an RCA expires within 45 days, a "Compare renewal prices →" link to iasig.ro appears.

**Key files:** `src/types/costs.ts` (`DocumentType`, `DocumentCategory`, `VaultDocument` with `label`/`category`), `src/lib/ai/prompts/{car-document-extraction,document-extraction}.ts` (both prompts return `label` + `category`), `src/lib/ai/document-parser.ts` (`parseCarDocument`, `CATEGORY_VALUES`), `src/lib/costs/processor.ts` (`isVehicleDoc` category-based routing; re-runs car prompt for vehicle/driver/unknown docs), `src/app/api/vehicles/[vehicleId]/vault/{route,calendar/route,[documentId]/route}.ts` (`deriveCategory` fallback), `src/hooks/useVaultDocuments.ts`, `src/app/(dashboard)/documents/{page.tsx,documents-client.tsx}` (category grouping, filename inference), `supabase/migrations/025_vehicle_doc_meta.sql`, `030_documents_manual_source.sql`. `label`/`category` are stored inside `documents.parsed_json` — no migration required.

**Dependencies:** Anthropic Vision, Supabase Storage, TanStack Query, next-intl.

---

## 9. Energy & tariffs

**What:** Per-user electricity tariff provider; computes the cheapest contiguous charging window ("smart charge") and a daily price curve. The smart-charge algorithm only scans `fromHour..ceiling` (no backward overnight scan) and honours an optional `departureHour` constraint. Tibber prices are DST-safe (`parseLocalHour` reads the ISO `HH` field) and drop zero/missing prices (treated as "no data", not free charging).

**How to use:** UI `/energy` (`SmartChargeCard` hero, `PriceCurveChart` recharts area chart, collapsible Departure card); provider picker in `/settings`. API: `GET /api/tariffs/prices` (resolves user provider, builds forecast + recommendation), `GET/PUT /api/tariffs/settings` (read/set active provider; PUT returns 500 on upsert error).

**Key files:** `src/lib/external/tariffs/{recommend.ts,registry.ts,providers/*}`, `src/components/energy/{SmartChargeCard,PriceCurveChart}.tsx`, `src/app/(dashboard)/energy/energy-client.tsx`.

**Dependencies:** Tibber GraphQL (live, optional `TIBBER_TOKEN`). Other providers (Octopus, aWATTar, Electrica, E.ON RO, Enel RO, Hidroelectrica) are mock price curves.

---

## 10. Charger Data Platform (PostGIS)

**What:** A fast, deduplicated, confidence-scored charging-station dataset stored in **PostGIS**, fed by hybrid ingestion (lazy cache-through on request + scheduled bulk imports) from open/free sources: OpenChargeMap (global), OpenStreetMap/Overpass, **BNetzA** (Germany), **NDW** (Netherlands), **IRVE** (France, data.gouv.fr), **Austria** (ArcGIS), and **TomTom EV** (only when `TOMTOM_API_KEY` is set). ChargePrice enriches pricing. Replaces slow per-request live aggregation.

**Pipeline:** `fetchAllSources(bbox)` (sources in parallel) → `clusterChargers` (spatial ≤60 m + fuzzy operator/connector/name match; same-site force-merge at 25 m; upstream OCM per-field overwrite) → `computeConfidence` → batched `upsert_chargers_batch` RPC (content-hash skips unchanged rows). Orchestrated by `ingestArea(bbox)` / `ensureAreaFresh(bbox)` (Upstash Redis tile + country freshness). Availability (`operational`/`offline`/`stale`/`unknown`) is derived from OCM status + last-verified date (stale after 90 days). Charger tables are **shared reference data — not user-scoped** (a deliberate, documented exception to the `.eq(user_id)` rule).

**Query APIs** (auth + rate-limited `chargers` bucket, Zod-validated; return `Charger[]`):
- `GET /api/chargers?bbox=minLng,minLat,maxLng,maxLat&minKw&connector&limit` — viewport query; returns current rows immediately and refreshes stale tiles in the background via `after()`.
- `GET /api/chargers/nearby?lat&lng&radius&minKw&connector&minConfidence&limit` — `ST_DWithin` + distance sort; triggers lazy ingest.
- `GET /api/chargers/search?q&country&limit` — trigram name/operator search (DB only).
- `GET /api/chargers/[id]` — single canonical charger.
- `GET /api/chargers/stats` — session-authed; `{ totalChargers, fastChargers, lastRefresh }` for the Settings "Charger network" health card.

**Bulk imports (scheduled):** `GET /api/internal/warm?country=<cc>` (Bearer `CRON_SECRET` or `x-webhook-secret`; fails closed 503) runs `bulkImportCountry` for a covered country (ro, de, fr, at, nl, hu) from its official open-data source + OCM, deduped over a 1°×1° grid, then marks the country bulk-fresh for 48 h. Vercel crons fire per country (see `vercel.json`). `GET /api/internal/ingest-stats` returns the last 50 `ingest_runs` rows + summary for observability (same secret auth).

**Key files:** `src/lib/chargers/{types,tiles,normalize,dedup,confidence,query,repository,countries}.ts`, `src/lib/chargers/ingest/{ocm,overpass,bnetza,ndw,irve,austria,tomtom,chargeprice,bulk,index}.ts`, `src/app/api/chargers/{route,nearby,search,stats,[id]}/route.ts`, `src/app/api/internal/{warm,ingest-stats}/route.ts`, `vercel.json`, `supabase/migrations/017_chargers.sql` … `022_batch_upsert_chargers.sql`, `src/lib/chargers/__tests__/`.

**Dependencies:** Supabase (PostGIS + pg_trgm; apply migrations 017–022), Upstash Redis, official open-data APIs. Env: `OPEN_CHARGE_MAP_API_KEY` (recommended), `TOMTOM_API_KEY` / `CHARGEPRICE_API_KEY` (optional), `CRON_SECRET` and/or `INGEST_WEBHOOK_SECRET`.

> Legacy live-aggregation routes `GET /api/charging-map` and `GET /api/charging-stations` still exist (auth + rate-limited) but are no longer consumed by the charging-map UI; the latter is kept only for its re-exported `ChargingStation` type.

---

## 11. Charging map

**What:** Full-screen AmpWhere-style station browser. Pins are CSS `DivIcon` markers (SVG renders blank on mobile WebKit) wrapped in a `MarkerClusterGroup`; power-tier colours (red 350+/orange 150+/green 50+/blue <50/grey offline). The map queries the **viewport bbox** on every pan/zoom (`MoveWatcher` on `moveend`+`zoomend`, micro-move-skip, memoized markers to stop flicker) against `GET /api/chargers`. Basemap is CARTO Voyager. A floating filter bar (min power · connector) feeds the query and React Query key; a "List" button opens `StationListSheet` (distance-sorted, debounced search via `/api/chargers/search`). Tapping a pin opens `ChargerDetailSheet` (power, connectors, address, status dot with `~` estimated-availability disclaimer, Directions, and **Send to Car** when a Tesla is in the garage). Auto-locate (silent 3 s timeout) resets the query area to the user; cold/never-ingested areas show a pulsing "looking for stations" badge and poll up to 3× at 4 s.

**Send to Car:** `vehiclesApi.shareNavigation` POSTs `share_navigation` (destination) and — for non-Supercharger stations ≥50 kW — `precondition_max` in parallel. Falls back to the first Tesla in the garage (demo mode).

**How to use:** UI `/charging-map`. The page consumes `GET /api/chargers` (PostGIS); availability is simulator-derived, not a live operator feed.

**Key files:** `src/components/charging-map/{StationMap,ChargerDetailSheet,StationListSheet}.tsx`, `src/app/(dashboard)/charging-map/charging-map-client.tsx`, `src/lib/api/chargers.ts`, `src/lib/external/charging-networks/availability.ts`.

**Dependencies:** Leaflet, react-leaflet-cluster, leaflet.markercluster, sonner, the Charger Data Platform (section 10).

---

## 12. Trip planner

**What:** ABRP-style planner: routes origin → destination, inserts charging stops when weather-derated range runs low, and shows cost + petrol comparison. Uses a 10% default safety reserve (user-configurable `arrivalSocPct`, 0–50) and an 80% default charge target. Plans across **alternative roads** (TomTom → ORS → OSRM, up to 3) × **charging strategies** (`fastest` ~70% top-ups vs `balanced` ~95%), runs combinations in parallel, dedupes by `roadIndex + stop-station-ids + rounded-time`, and returns sorted `variants[]` plus a recommended `plan`. A second routing pass routes through the chosen stops so the polyline and distance reflect detours. Variant chips get semantic badges (Fastest / Fewest stops / Cheapest).

**Accuracy details:**
- **Real-road station search:** stop search points are sampled along the actual route polyline (`pointAlongRoute`), not a straight line.
- **Real charge curves:** SoC-dependent DC curve integrated per stop (`charge-curve.ts`, `TESLA_NMC_CURVE`); slow stations cap power.
- **Personal consumption calibration:** `getPersonalEfficiency` computes kWh/100km from the vehicle's `charging_sessions` + `trips` (needs ≥200 km / ≥5 kWh, plausible 8–45 kWh/100km) and feeds range, energy cost, and derating; falls back to spec.
- **Trip energy cost:** even no-stop trips show realistic energy (`tripEnergyKwh` from distance/derated-range × capacity) priced at the user's home tariff (`tripEnergyCostEur`, default ~€0.20/kWh).
- **Connector-aware scoring:** `filterUsableStations` drops offline / low-confidence / incompatible-connector / `maxKw <= 0` stations; `scoreStation` weights effective kW minus detour (`detourKm * 2`) and price penalties. Zero-coverage gaps emit a `warning` naming the km range.
- **Real weather:** `getWeatherAsync` (Open-Meteo, 30-min cell cache) drives derating.
- **Reliability badge:** OCM `DateLastVerified` / `IsOperational` → offline / stale / good / unknown badge on `StopCard` + `StationDetailSheet`.
- **Send to Tesla:** when the planned vehicle is a Tesla and the route is feasible, a button POSTs `share_navigation` with **all charging stops as waypoints** (full route in one call); `precondition_max` is automatically called at departure for any non-Supercharger DC stop. Tesla handles Supercharger preconditioning internally. A manual "Pornește precondiționare" button is always visible as a fallback. A one-time dismissable disclaimer explains the behavior difference between Supercharger and non-Tesla stops.
- **Saved routes:** users can save up to 10 planned routes (auto-named "Origine → Destinație", renameable). Entry points: bookmark button in the desktop sidebar, above the mobile search form, and in the mobile results-sheet handle — all open the same bottom sheet. Save button locks into a "saved ✓" state (no duplicate rows); the chosen variant is persisted (`savedVariant` in `plan_snapshot`) and restored on load; corrupted snapshots are validated and fall back to origin/destination only. Delete uses an inline styled confirm (no `window.confirm`). Client state lives in `src/hooks/useSavedRoutes.ts` (TanStack Query). Stored in `saved_routes` table (Supabase, RLS + `user_id` index, migration 032+033). API: `GET/POST /api/saved-routes` (payload capped at 100KB, labels at 300 chars), `PATCH/DELETE /api/saved-routes/[id]`.

**Corridor stations:** `fetchCorridorStations` sources stops from the PostGIS platform (per-segment bbox sampling) with an OCM fallback for non-bulk countries and a final Overpass fallback. `TripMap` renders nearby chargers as context dots from `GET /api/chargers`.

**Address search (geocoding):** `GET /api/geocode?q=&lat=&lng=&cc=` proxies Nominatim → Photon (fuzzy fallback) with optional bias point + country filter; quota 600 req/h/user (debounced typeahead). Reverse geocoding (`/reverse`) powers "Use my location". Network errors surface a localized message instead of raw `Failed to fetch`.

**UX:** map-first compressed form (origin/destination first; SOC + vehicle behind an "Options"/"Advanced" disclosure); recent destinations (`localStorage`, LIFO ×5); user-configurable petrol comparison (`localStorage["flux_fuel_comparison"]`); collapsible results panel; full keyboard nav + combobox ARIA on `GeocodingSearch`; desktop sidebar (lg+) with `StatStrip` results. `ModelSpec.supportedConnectors` is `["ccs2","tesla"]` for all Tesla models.

**How to use:** UI `/trip`. API: `POST /api/trip-plan` (vehicle/origin/SOC/destination/`arrivalSocPct` → `planTripVariants`; `maxDuration = 30`), `GET /api/geocode`.

**Key files:** `src/app/api/trip-plan/route.ts`, `src/lib/external/routing/{planner,corridor-stations,charge-curve,reliability,types}.ts`, `src/lib/external/routing/providers/{osrm-router,ors-router,tomtom-router}.ts`, `src/app/api/geocode/route.ts`, `src/components/trip/{GeocodingSearch,TripMap,StopCard,CostSummary,StationDetailSheet,ReliabilityBadge}.tsx`, `src/app/(dashboard)/trip/trip-client.tsx`, `src/lib/{fuel-comparison,brands/models}.ts`.

**Dependencies:** OSRM (`router.project-osrm.org`), ORS (`OPENROUTESERVICE_API_KEY`, optional), TomTom (`TOMTOM_API_KEY`, optional), Nominatim + Photon, Open-Meteo, the Charger Data Platform, Leaflet, sonner, tariff registry.

---

## 13. Unified Map (`/map`)

**What:** A single full-screen map that unifies the trip planner and charger browser into one sheet-based UI (ABRP / Google Maps style), with `?mode=plan` / `?mode=explore`. A draggable bottom sheet has measured snap points; in plan mode results render as a per-route accordion in a minimal top card (no bottom sheet), and the explore station list is an opt-in "List · N" pill. Reuses `TripMap`, `StationMap`, `ChargerDetailSheet`, `StationDetailSheet`, `GeocodingSearch`, `StopCard`, `CostSummary`, and the shared `map-ui.tsx` primitives — no planning/station logic is duplicated. Detail sheets open as true modals (z above the main sheet); alt-route polylines are a single tappable wide dashed band; PWA-standalone safe-area offsets keep the sheet/controls above the floating nav.

**How to use:** UI `/map`. Tap "Map" in nav. Explore: filter pills + station list. Plan: origin/destination + Advanced (SOC + vehicle) + Plan → tappable route variants.

**Key files:** `src/app/(dashboard)/map/{page.tsx,map-client.tsx}`, `src/components/map/map-ui.tsx`.

**Dependencies:** Framer Motion, react-leaflet, TanStack Query, next-intl. Same `POST /api/trip-plan` + `GET /api/chargers`.

---

## 14. Insights

**What:** A single analytics page (`/insights`) aggregating 4 dimensions over a selectable period (7d / 30d / 1y / all):
1. **Savings & CO₂** — RON saved vs petrol (7 L/100km × 7.5 RON/L), litres avoided, kg CO₂ (2.36 kg/L), tree-equivalents.
2. **Activity** — km driven, drive hours, trip count, kWh charged, monthly mileage chart.
3. **Battery health** — current SoH %, SoH sparkline, vampire drain (%/h while parked).
4. **Efficiency** — avg Wh/km, Wh/km by temperature bucket, projected range.

**How to use:** UI `/insights` (Sidebar / mobile More). API: `GET /api/vehicles/[vehicleId]/stats` (trips + charging + snapshots), plus `/api/costs`, `/api/vehicles/[vehicleId]/battery-health`, `/api/vehicles/[vehicleId]/state`.

**Mock data pipeline:** the simulator now feeds the analytics tables: `trips.energy_used_kwh`/`efficiency_kwh_per_100km` computed on trip close (with temperature factor), `vehicle_snapshots` written per 10-min bucket (`maybeRecordSnapshot`), standby/vampire draw (~0.6%/day) in parked physics, and shared `seasonalTempC(lat, date)`.

**Key files:** `src/app/(dashboard)/insights/{page.tsx,insights-client.tsx}`, `src/app/api/vehicles/[vehicleId]/stats/route.ts`, `src/hooks/useStats.ts`, `src/types/stats.ts`, `src/lib/mock/persistence.ts`.

**Dependencies:** TanStack Query, recharts.

---

## 15. Settings

**What:** Preferences (locale, currency, install app), home location, tariff provider, vehicles (scenario + deactivate/reactivate), charger-network health, WhatsApp phone, notifications, billing, and account danger zone (export / delete). Crash-resilient: the server component does only an auth check; `SettingsClient` fetches all data via TanStack Query and falls back to defaults if any call fails. iOS-style collapsible sections (`localStorage`-persisted), single-label rows, `appearance-none` selects.

**How to use:** UI `/settings`. API: `GET/PATCH /api/me/preferences`, `GET /api/user/export` (GDPR export, rate-limited 5/period), `DELETE /api/user/delete`, `GET/PUT /api/tariffs/settings`, `GET /api/me/notification-preferences`. After Stripe checkout, `?checkout=success` shows a toast and is stripped from the URL.

**Key files:** `src/app/(dashboard)/settings/{page.tsx,settings-client.tsx,danger-zone.tsx}`, `src/components/settings/*`, `src/app/api/me/preferences/route.ts`, `src/app/api/user/{export,delete}/route.ts`.

**Dependencies:** TanStack Query, Supabase (via API routes), next-intl. `/about-data` is a companion read-only transparency page.

### Capability context endpoint

`GET /api/me/capabilities` returns `{ hasVehicle, hasLiveVehicle, hasTariff, hasCommandsReady, hasProSubscription }` so clients gate UI in one fetch. Unauthenticated callers get all-false defaults (not 401). Key files: `src/app/api/me/capabilities/route.ts`, `src/lib/capabilities.ts`.

---

## 16. Billing / subscription

**What:** Stripe-backed Free/Pro tiers. Free: 1 vehicle, 3 documents/month. Pro lifts both. Tier read from `profiles.subscription_tier`.

**How to use:** UI in `/settings` and `/pricing` (`UpgradeButton`, `ManageSubscriptionButton`, both i18n + toast on error). API:
- `POST /api/billing/checkout` — Stripe Checkout (`{ tier: "pro" | "pro_annual" }`).
- `POST /api/billing/portal` — Stripe customer portal.
- `POST /api/billing/webhook` — signature-verified, idempotent via `stripe_events`.

**GDPR export fix:** `charging_sessions`, `command_events`, `energy_costs` have no `user_id` column (owned through `vehicles`); export fetches the user's vehicle IDs first, then filters child tables by `.in("vehicle_id", …)`.

**Key files:** `src/lib/stripe.ts`, `src/lib/subscription.ts` (`getSubscriptionTier`, `canAddVehicle`, `canUploadDocument`), `src/app/api/billing/*`, `src/app/api/user/export/route.ts`, `src/components/billing/*`.

**Dependencies:** Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`). Routes fail with 503 if price/webhook secret is missing.

---

## 17. Multi-channel notifications (feature-flagged)

**What:** Background-aware alerts that reach the user when the app is closed. The poll-vehicles cron checks each stationary vehicle every 15 min, fetches weather at its location, runs a pure alert engine (rain + open windows, freeze/snow, heat ≥35°C, hail/severe storm), and dispatches matching alerts through every enabled channel: **Web Push**, **Email** (Resend), **WhatsApp** (Twilio). A per-(vehicle, alert-type) session key prevents re-firing within one parking session.

**Status:** Ships dark behind `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`. When unset/false the settings card is hidden, notification API routes return 404, and the cron no-ops. **Known gap:** live Tesla telemetry returns `windowsOpen = null`, so the rain+windows alert only fires for mock vehicles.

**How to use:** Settings → *Notificări* card (toggle channels + alert types; Test button sends an instant push). Ops: set `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=true`, `CRON_SECRET`, VAPID keys, `RESEND_API_KEY`, Twilio creds. Cron `POST /api/cron/poll-vehicles` runs `*/15 * * * *` with `Authorization: Bearer <CRON_SECRET>`. Push management: `POST /api/push/subscribe`, `POST /api/push/test`, `GET /api/push/vapid-public-key`. Prefs: `GET/PATCH /api/me/notification-preferences`.

**Key files:** `src/lib/feature-flags.ts`, `src/types/notifications.ts`, `src/lib/notifications/{alert-engine,dispatch,email,whatsapp,preferences}.ts`, `src/lib/push/send.ts`, `src/lib/i18n/notify.ts`, `src/app/api/cron/poll-vehicles/route.ts`, `src/app/api/push/*/route.ts`, `src/app/api/me/notification-preferences/route.ts`, `src/hooks/{usePushNotifications,useNotificationPreferences}.ts`, `src/components/settings/NotificationsCard.tsx`, `public/sw.js`, `supabase/migrations/026`–`028`, `vercel.json`.

**Dependencies:** `web-push`, Resend REST, Twilio REST, Open-Meteo, Supabase admin, TanStack Query.

---

## 18. Display currency conversion

**What:** All money in the UI converts to the user's preferred currency (Settings → Currency, `profiles.display_currency`). Storage stays canonical (costs in RON, trip/charging estimates in EUR); conversion happens only at render via BNR rates, falling back to the canonical currency until rates load. Subscription prices on `/pricing` stay in EUR. Number formatting uses the correct IETF locale per language (`de-DE`, `fr-FR`, `hu-HU`, `ro-RO`, `en-GB`).

**How to use:** Pick a currency in Settings. API: `GET /api/exchange-rates` (auth + rate-limited; `{ display, ronPerEur, ronPerDisplay }`). Covered: costs KPIs/chart, trip planner, map route summary, charging history, smart-charge savings.

**Key files:** `src/app/api/exchange-rates/route.ts`, `src/hooks/useCurrency.ts`, `src/lib/currency/format.ts`, `src/lib/external/bnr/client.ts` (zero-rate guard).

**Dependencies:** BNR client (`exchange_rates` cache table), `usePreferences`.

---

## 19. Internationalization (i18n)

**What:** Full UI translation across 5 locales — `ro` (default), `en`, `de`, `fr`, `hu` — via next-intl. Locale stored in the `flux_locale` cookie.

**How to use:** `useTranslations("namespace")` (client) / `getTranslations` (server). Locale switching via `LocalePicker` in settings.

**Key files:** `src/lib/i18n/config.ts`, `src/lib/i18n/locales/{en,ro,de,fr,hu}.json`.

**Rule:** Every visible string must exist in all 5 locale files.

---

## 20. PWA (installable app)

**What:** Installable home-screen app on Android and iOS. A network-first service worker (`flux-v1` cache) pre-caches `/` and `/dashboard` and serves them offline; old caches pruned on activate; `push` + `notificationclick` handlers for section 17. An install banner handles Android (`beforeinstallprompt`, captured at module scope via `useSyncExternalStore`) and iOS (Share-sheet hint). The Web App Manifest is served by Next.js from `src/app/manifest.ts` (`start_url=/dashboard`, splash `#09090b`). Settings → Preferences → Install app always offers install. PWA-standalone media query disables iOS rubber-band overscroll.

**Key files:** `public/sw.js`, `src/lib/pwa/use-install-prompt.ts`, `src/components/pwa/{ServiceWorkerRegistrar,InstallPrompt,InstallAppButton}.tsx`, `src/app/manifest.ts`, `src/app/(dashboard)/layout.tsx`, `public/icon-192.png`, `public/icon-512.png`.

**Dependencies:** framer-motion. Requires HTTPS in production for SW registration.

---

## 21. Public pages (landing + product)

**What:**
- **Landing (`/`)** — cinematic dark redesign: Nav · Hero (animated SVG road + Aurora background) · Social Proof (`CountUp`) · Vehicle feature · Bento grid · Cost Intelligence · Trip Planner · CTA · Footer. Framer Motion scroll animations; logged-in users redirect to `/dashboard`.
- **Product (`/pricing`)** — full product page: ProductNav, ProductHero, AnyEvBar (multi-brand), FeatureExplainers (5), RoadmapSection ("coming soon" cards incl. car-admin hub: insurance, vignettes, tolls, tax, reminders, non-EV — see `docs/INTEGRATIONS-CAR-ADMIN.md`), PricingSection (monthly/annual toggle), TrustStrip, FaqSection, FeedbackSection (`POST /api/feedback` → `feedback` table; public, rate-limited by user ID or IP), ProductFooter.

**Key files:** `src/app/page.tsx`, `src/components/landing/*`, `src/app/pricing/page.tsx`, `src/components/product/*`, `src/app/api/feedback/route.ts`, `supabase/migrations/023_feedback.sql`.

**Dependencies:** Framer Motion, next-intl, lucide-react, `UpgradeButton`.

---

## 22. Design system & UX foundation

**What:** "Flux 2027" dark-only design system. Dark theme is forced (`ThemeProvider forcedTheme="dark"`); the light/dark toggle is removed. A custom `FluxLogo` SVG replaces the generic icon in Sidebar/TopBar/favicon. Shared primitives: `GlassCard`, `CircularProgress`, `PageWrapper`, animation variants, the floating-pill auto-hiding `BottomNav` (`useScrollDirection`), `SlideUpMenu` (2-column "More" grid), and `map-ui.tsx` (`DesktopSidebar`, `StatStrip`). CSS tokens, `.glass-card`/`.data-card`/`.action-card`/`.auth-input` utilities, ambient body tinting, and slim/compact mobile layouts live in `globals.css`.

**Cross-cutting UX/correctness:** route-level loading skeleton (`(dashboard)/loading.tsx`), root crash boundary (`global-error.tsx`), optimistic command UI, iOS safe-area handling (`viewportFit: "cover"`, `env(safe-area-inset-*)`), accessibility pass (12px text floor, `role="alert"` live regions, 44px tap targets, focus traps on overlays/modals, combobox/listbox ARIA on geocoding, slider/select `aria-label`), and per-locale number formatting.

**Key files:** `src/app/globals.css`, `src/components/ui/{glass-card,circular-progress}.tsx`, `src/components/layout/{page-wrapper,BottomNav,TopBar,Sidebar,SlideUpMenu}.tsx`, `src/hooks/useScrollDirection.ts`, `src/lib/animations/variants.ts`, `src/components/providers.tsx`, `src/components/ui/FluxLogo.tsx`, `src/app/(dashboard)/{loading.tsx,layout.tsx}`, `src/app/global-error.tsx`.

**Dependencies:** Framer Motion, Tailwind CSS v4.

---

## 23. Platform endpoints & infra

- **Tesla Fleet API (dormant):** `GET /api/tesla/connect`, `GET /api/tesla/callback`, `POST /api/tesla/refresh`, `POST /api/tesla/command`, `GET /api/tesla/vehicle` — all return **410** unless `isLiveEnabled("tesla")`. `GET /api/tesla-public-key` serves the command-signing public key (proxied to `/.well-known/appspecific/com.tesla.3p.public-key.pem` via `next.config.ts` rewrites). Tesla token refresh is single-flighted per vehicle (`src/lib/tesla/tokens.ts`).
- **Typed API client layer (`src/lib/api/`):** all client HTTP calls go through one typed module per resource (`vehicles`, `chargers`, `documents`, `me`, `tariffs`, `costs`, `trip`); `apiFetch` (`src/lib/api-fetch.ts`) is imported only here. `apiFetch` redirects to `/login` on client 401.
- **Rate limiting:** `checkRateLimit(userId, bucket, max)` in `src/lib/rate-limit.ts` (Upstash Redis).

---

## 24. Security hardening

- **Auth on every route** + Supabase UUID-scoped queries (`.eq("user_id", …)`); write routes resolve `ensureSupabaseUserId`.
- **Webhook secrets** via `x-webhook-secret` header only (inbound-email, internal warm/ingest-stats); fail closed (503) when unconfigured.
- **CSP:** `src/proxy.ts` (Next.js 16 Proxy convention) emits a per-request nonce CSP — `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'unsafe-inline'` (framer-motion), `connect-src 'self' {SUPABASE_URL}`, `frame-ancestors 'none'`, `object-src 'none'`, etc.
- **IDOR fix:** `GET /api/documents` filters by `user_id` in addition to vehicle ownership.
- **Rate limits** on Tesla vehicle route (60/window) and all `chargers` query routes.
- **Charger tables** are shared reference data — the documented exception to the per-user RLS rule.

> Known follow-up: `state`, `charging-history`, `weather`, `battery-health`, `commands`, `trip-plan` filter on `session.user.id` directly. Not broken in practice — the JWT callback bakes the Supabase UUID at sign-in; extending `ensureSupabaseUserId` to the 30 s-polled `state` route would add an admin round-trip on the hottest endpoint.

---

## 25. Testing

- **Unit:** charger pipeline (`src/lib/chargers/__tests__/`: normalize, ingest, dedup, confidence, query), charge curve, mock engine.
- **E2E (Playwright):** `playwright.config.ts` + `e2e/` (smoke, auth, garage, costs, trip, authed-flow). CI `e2e-smoke` runs `smoke.spec.ts` (no credentials); authenticated specs gated on `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`. Run: `npm run test:e2e` (`npx playwright install --with-deps chromium` once).
