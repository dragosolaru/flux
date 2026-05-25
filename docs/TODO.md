# Flux — Product TODO

_Last updated: 2026-05-25_

---

## 🔴 Critical / Blockers

Items that prevent basic app functionality for real users.

### 1. Tesla VCP proxy — Vehicle Command Protocol for post-2021 cars
Commands (lock, climate, horn, charge limit) silently fail with `VCP_REQUIRED` (HTTP 412) on every Model 3/Y/S/X built after mid-2021. The `CommandsLimitedBanner` warns users but there is no working path. The code in `src/lib/tesla/api.ts` already branches on `TESLA_PROXY_BASE_URL`; the `tesla-http-proxy` Go binary just needs to be deployed (Fly.io) and the env var set.
- **Effort:** `[L]`

### 2. No real tariff providers — Energy page is mock-only
All three tariff providers (`tibber-mock`, `octopus-mock`, `awattar-mock`) are fabricated price curves. `hasTariff` in the capabilities check returns `false` for any `-mock` provider, so the Energy page is behind a feature gate for all real users. No real Tibber/Octopus/Romanian supplier integration exists.
- **Effort:** `[L]`

### 3. Smoke / E2E test suite is missing
No Playwright (or equivalent) tests exist. The ROADMAP marks "Playwright smoke tests" as TODO. Any regression (auth, add vehicle, upload doc) goes undetected in CI.
- **Effort:** `[M]`

### 4. `virtual_key_paired` is never set to `true`
`hasCommandsReady` depends on `virtual_key_paired = true` in the `vehicles` table, but there is no UI flow or API endpoint to set this flag after a user pairs Flux as a Tesla Virtual Key. Commands will remain gated even after the VCP proxy is deployed.
- **Effort:** `[S]`

### 5. ~~i18n config lists only `ro` + `en` — de/hu/fr are broken~~ ✅ DONE
~~`src/lib/i18n/config.ts` only defines `ro` and `en`. No locale JSON files exist for German, Hungarian, French, or other currencies mentioned in the product brief. Any user with a browser set to one of those languages falls back to Romanian silently.~~
`de`, `hu`, `fr` locale files added with all namespaces. All 5 locales now complete.

---

## 🟡 High Priority — Next Sprint

High-value features or partial implementations that need to be completed.

### 6. ~~Real Tibber API integration (live tariff prices)~~ ✅ DONE
~~Replace `tibber-mock` with a real Tibber GraphQL client.~~
Real Tibber GraphQL provider added in `src/lib/external/tariffs/providers/tibber.ts`. Set `TIBBER_TOKEN` env var to enable. 1-hour in-memory cache.

### 7. ~~Romanian tariff providers (Enel, E.ON, Electrica)~~ ✅ DONE
~~The product is Romania-first but there are no Romanian energy suppliers in the tariff registry.~~
Added: Electrica Furnizare, E.ON Energie România (ToU), Enel Energie Muntenia, Hidroelectrica. All with real rate structures.

### 8. WhatsApp OCR ingest via Twilio webhook
`IngestCard` shows a WhatsApp icon / CTA but there is no Twilio webhook endpoint. The existing Cloudmailin email pipeline (`/api/documents/inbound-email`) already does the OCR heavy lifting; a new `/api/documents/inbound-whatsapp` route needs to accept Twilio Media, store to Supabase Storage, then call the same `processDocument` pipeline.
- **Effort:** `[M]`

### 9. ~~VehicleCard image / avatar is absent~~ ✅ DONE
~~`VehicleCard` and `VehicleListCard` render brand name text but no vehicle silhouette or image.~~
`VehicleModelImage` component added with inline SVG silhouettes for Model 3, Y, S, X, Cybertruck + generic fallback. Uses `currentColor` for theme compatibility.

### 10. ~~Computed trip metrics: Wh/km, cost/km, trip cost~~ ✅ DONE
~~Efficiency metrics (Wh/km) are not displayed anywhere.~~
`kpi_wh_per_km` added to costs API + CostDashboard. Formula: `(totalKwh * 1000) / totalKm`.

### 11. ~~State of Health (SoH) estimate for Tesla~~ ✅ DONE
~~Tesla does not expose SoH directly; it must be estimated from `battery_range / rated_range`.~~
SoH estimated as `(battery_range / rated_range) × 100`, clamped to [50, 105]%. Populated in `fetchVehicleData`.

### 12. Tesla charging history sync — no automatic scheduling
`useChargingHistorySync` triggers a manual sync button. There is no background job or server-side cron that auto-syncs after each charging session ends. Users who forget to press the button will have gaps in their charging history.
- **Effort:** `[M]`

### 13. CommandPanel has no i18n — hardcoded English strings
`CommandPanel.tsx` uses raw English strings (`"Lock"`, `"Unlock"`, `"Climate off"`, `"Climate on"`, `"Honk"`, `"Flash"`, `"sending…"`). The i18n key namespace `commands` exists in `en.json`/`ro.json` but only has `title` and `subtitle`. Button labels need to be added.
- **Effort:** `[S]`

### 14. Costs page title and empty states are hardcoded in Romanian
`costs-client.tsx` has `<h1>Costuri</h1>` and Romanian empty state strings directly in JSX with no `useTranslations`. This is inconsistent with the rest of the app.
- **Effort:** `[S]`

---

## 🟢 Medium Priority

Good-to-have improvements and competitive differentiators.

### 15. Trip planner uses mock routing and mock weather
`mockRouter.computeRoute()` does straight-line Haversine math; `mockWeather` returns a fixed snapshot. Replacing routing with OSRM/GraphHopper and weather with Open-Meteo (both free tiers) would make trip plans credible.
- **Effort:** `[L]`

### 16. Charging map uses static hardcoded stations (~50)
`stations.ts` is a hardcoded array of ~50 European stations. Integrating OpenChargeMap API (free, 300k+ POIs) or the Chargetrip API would make the map genuinely useful for trip planning.
- **Effort:** `[L]`

### 17. Vehicle simulator scenarios are fixed (no user control)
Users can pick a scenario when adding a mock vehicle, but cannot change it afterward. Adding a scenario switcher in Settings or the Garage card would improve demo usability.
- **Effort:** `[S]`

### 18. Cost export (CSV / PDF)
There is no export feature for `energy_costs`. A simple CSV download endpoint (`/api/costs/export?vehicleId=…`) would be a meaningful differentiator vs. the Tesla app.
- **Effort:** `[S]`

### 19. ~~Smart charge — auto-start via Tesla command~~ ✅ DONE
~~`SmartChargeCard` shows a recommendation but there is no "Schedule now" button.~~
Schedule button added. Sends `schedule_charging` → Tesla `set_scheduled_charging`. Shows confirmation state for 10s.

### 20. Multi-vehicle smart charge coordinator
`SmartChargeCard` renders each vehicle independently. If a user has two EVs sharing a home charger (single-phase circuit), recommendations should be staggered to avoid overloading. This is a pure computation change in `computeSmartCharge`.
- **Effort:** `[M]`

### 21. Charging map availability is simulated, not real
`availability.ts` uses a deterministic pseudo-random occupancy model keyed to station ID + 2-minute epoch. It looks live but is entirely synthetic. Even a simple "last updated" disclaimer would improve trust.
- **Effort:** `[S]` (add disclaimer) / `[XL]` (real OCPI feed)

### 22. ~~PWA / home screen installability~~ ✅ DONE
~~No `manifest.webmanifest`, no service worker, no offline support.~~
`manifest.webmanifest` added at `/public/manifest.webmanifest` with icons, theme color, display:standalone. `<link rel="manifest">` in root layout.

### 23. In-app notifications for charging events
No push notification or in-app alert fires when charging completes or when the cheap tariff window opens. Tesla's API can report state changes; pairing that with a push notification would be a meaningful differentiator.
- **Effort:** `[L]`

### 24. Settings page is partially i18n'd — section titles use hardcoded English
Settings page has `"Vehicles"`, `"Account"` etc. hardcoded in JSX. These need `t("settings.section.vehicles")` keys.
- **Effort:** `[S]`

### 25. Non-Tesla brand support is archived
The codebase only has `tesla` in the brands registry (`src/lib/brands/registry.ts`). BMW, Polestar, etc. are on an archived branch. Adding even one more real brand (BMW ConnectedDrive) would broaden the market.
- **Effort:** `[XL]`

---

## ⚪ Planned / Future

Long-term items, monetization, infra.

### 26. Subscription model (Stripe)
No Stripe integration exists. The product vision calls for a freemium tier (1 mock vehicle free) and Pro ~€4.99/month (live Tesla + full features). Needs: Stripe Checkout, webhook handler, `subscription_tier` column in `users`, capability checks updated to respect tier.
- **Effort:** `[XL]`

### 27. iOS/Android native wrapper or web widget
The mobile web app is good but a React Native / Expo wrapper would enable background battery refresh, widgets, and CarPlay. Alternatively, iOS WidgetKit via a small SwiftUI widget calling the existing `/api/vehicles/[id]/state` endpoint.
- **Effort:** `[XL]`

### 28. Real-time vehicle telemetry via Tesla Fleet Telemetry
Currently the app polls `/vehicle_data` every 30 seconds via the REST API. Tesla's Fleet Telemetry (WebSocket streaming) provides sub-second updates with much lower wake-up cost for sleeping cars. Requires Tesla Fleet API approval.
- **Effort:** `[XL]`

### 29. Home energy monitoring integration (Shelly, Fronius, SolarEdge)
The cost attribution model attributes EV charging proportionally from home bills. An MQTT/API integration with a smart home energy monitor would give precise kWh-per-session attribution without OCR guesswork.
- **Effort:** `[XL]`

### 30. ~~GDPR data export and account deletion~~ ✅ DONE
~~A full GDPR "download my data" and "delete my account" flow is needed before a public launch in the EU.~~
`GET /api/user/export` → JSON download of all user data. `DELETE /api/user` → ordered cascade delete + `auth.admin.deleteUser`. Settings danger zone UI with confirmation dialog.

### 31. ~~Rate limiting and abuse protection~~ ✅ DONE (in-memory)
~~No rate limiting exists on the document upload, OCR, or Tesla command proxy routes.~~
In-memory sliding window rate limiter at `src/lib/rate-limit.ts`. Applied to: uploads (10/hr), commands (30/hr), state polling (120/hr), charging-history (20/hr), auth/register (5/hr per IP). ⚠️ Not shared across Vercel instances — migrate to Upstash Redis before scale.

### 32. Admin / analytics dashboard
No way to see aggregate usage, OCR error rates, or top-used features. A simple Supabase-backed admin page (behind a role check) or PostHog integration would help prioritize future work.
- **Effort:** `[M]`

---

## ✅ Recently Completed

What was finished in the current development sprint.

- **Auth** — NextAuth + Supabase session bridge, Google OAuth
- **Mock vehicle simulator** — tick-based engine, 4 scenarios (commuter, road-trip, weekend, vacation), multi-step interpolation
- **Tesla OAuth (PKCE)** — state binding, CSRF protection, token encryption at rest (`TESLA_TOKEN_ENCRYPTION_KEY`)
- **Tesla live vehicle data** — `fetchVehicleData` polling every 30s, wake-up retry on 408, full state mapping
- **Vehicle commands** — mock command dispatch + live Tesla wiring via command-map; `door_lock`, `door_unlock`, `honk_horn`, `flash_lights`, `auto_conditioning_start/stop`, `set_charge_limit`
- **VCP error surfacing** — HTTP 412 + `VCP_REQUIRED` code returned to UI; `CommandsLimitedBanner` explains the situation
- **Capability model** — `NONE→VEHICLE→LIVE→TARIFF→COMMANDS` ladder; `FeatureGate` component + `CapabilityEmptyState`
- **Mobile bottom nav** — `BottomNav` + `SlideUpMenu` for mobile-first navigation
- **i18n** — next-intl v4, `ro`/`en` locales, cookie-based switching (de/hu/fr mentioned in brief but not implemented)
- **Multi-currency** — RON/EUR/USD/GBP/CHF/NOK/SEK/DKK/HUF via `CurrencyPicker`; BNR exchange rate client
- **BatteryGauge** — animated SVG arc gauge
- **Settings** — locale picker, currency picker, home location (Nominatim geocoding), tariff provider picker
- **OCR pipeline** — file upload → Supabase Storage → Anthropic Claude → `documents` table (migration 006)
- **Email ingest** — Cloudmailin webhook → `inbound-email` route → same OCR pipeline
- **Cost aggregation** — `energy_costs`, cost/km (home / public / blended), petrol comparison
- **Home bill attribution** — proportional EV kWh attribution from home energy bills (`src/lib/costs/attribution.ts`)
- **SmartChargeCard** — cheapest window recommendations using mock tariff data
- **PriceCurveChart** — 24h tariff bar chart with current hour + cheapest window highlighted
- **Tesla charging history sync** — `POST /api/vehicles/[vehicleId]/charging-history` + manual sync button
- **CostDashboard** — monthly trend chart, home vs public split, petrol equivalent comparison
- **Trip planner** — mock routing (Haversine), weather derating, charging stop insertion, multi-vehicle comparison
- **Charging map** — Leaflet map with ~50 hardcoded EU stations, mock availability, network/kW filters
- **Security audit (2nd pass)** — 6 new findings resolved: open redirect, email IDOR, webhook secret header-only, `getValidAccessToken` userId ownership, rate limits on state/history routes, scoped nickname search
- **Security audit (1st pass)** — 17 findings resolved (migrations 005, 007; RLS policies, token encryption, CSRF)
- **DepartureCard** — scheduled departure (Tesla `set_scheduled_departure`) + precondition-now (Tesla `set_preconditioning_max`), gated on COMMANDS capability
- **Battery preconditioning commands** — `schedule_charging`, `schedule_departure`, `precondition_max` in type system, command map, Tesla API, mock engine
- **Real Tibber API** — `TIBBER_TOKEN` env var, 1-hour cache, unlocks Energy page
- **Romanian tariff providers** — Electrica, E.ON ToU, Enel, Hidroelectrica
- **Tesla SVG silhouettes** — `VehicleModelImage` with Model 3/Y/S/X/Cybertruck inline SVGs
- **GDPR export/delete** — `GET /api/user/export` + `DELETE /api/user` + Settings danger zone
- **PWA manifest** — `manifest.webmanifest` + `<link rel="manifest">` in root layout
- **SoH estimate** — `battery_range / rated_range × 100`, clamped [50, 105]%
- **Wh/km efficiency KPI** — `kpi_wh_per_km` in costs API + CostDashboard
- **Smart charge schedule button** — sends `schedule_charging` command to Tesla
- **Rate limiting** — in-memory sliding window, 4 routes covered
- **i18n de/hu/fr** — German, Hungarian, French locale files with all namespaces
- **DB migrations 001–009** — initial schema through charging session uniqueness constraint
- **Dark/light theme** — `next-themes`, toggle in TopBar dropdown
