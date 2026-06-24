# Flux — Product TODO

_Last updated: 2026-06-24_

---

## 🔴 Critical / Blockers

### 1. Tesla VCP proxy — Vehicle Command Protocol for post-2021 cars
Commands (lock, climate, horn, charge limit) silently fail with `VCP_REQUIRED` (HTTP 412) on every Model 3/Y/S/X built after mid-2021. The code in `src/lib/tesla/api.ts` already branches on `TESLA_PROXY_BASE_URL`; the `tesla-http-proxy` Go binary needs to be deployed on Fly.io and the env var set.
- **Effort:** `[L]` — infra only, no code changes needed

---

## 🟡 High Priority — Next Sprint

### 2. Real Tibber API integration (live tariff prices)
The `TibberProvider` class is wired but the mock is used by default. Set `TIBBER_TOKEN` to enable real Tibber prices. Other providers (Octopus, aWATTar, Electrica, E.ON RO, Enel, Hidroelectrica) are still mock price curves.
- **Effort:** `[M]`

### 3. VehicleCard image / avatar is absent
`VehicleCard` and `VehicleListCard` render brand name text but no vehicle silhouette or image. A static SVG per Tesla model (Model 3, Y, S, X) would noticeably improve garage and dashboard UX.
- **Effort:** `[S]`

### 4. State of Health (SoH) estimate for Tesla
`BatteryHealthCard` renders `batteryHealthPct` but the live Tesla mapping returns `null`. Tesla does not expose SoH directly; estimate from `battery_range / rated_range`. Estimation logic + DB persistence both missing.
- **Effort:** `[M]`

### 5. Tesla charging history sync — no automatic scheduling
`useChargingHistorySync` is manual (button). No background job or cron auto-syncs after each session ends. Users who forget will have gaps.
- **Effort:** `[M]`

### 6. Smart charge — auto-start via Tesla command
`SmartChargeCard` shows a recommendation but has no "Schedule now" button that sends `set_scheduled_charging` to the Tesla API.
- **Effort:** `[M]`

---

## 🟢 Medium Priority

### 7. Smart charge multi-vehicle coordinator
`SmartChargeCard` renders each vehicle independently. For users with two EVs on one circuit, recommendations should be staggered to avoid overloading.
- **Effort:** `[M]`

### 8. Wire document triage prompt into processor
`src/lib/ai/prompts/document-triage.ts` (DOCUMENT_TRIAGE_PROMPT) is a classify-only pre-pass that improves bank-transfer disambiguation and routing confidence — but it is not yet wired into `processDocument`. Plugging it in as a fast first pass before the energy/car prompts would reduce misclassifications.
- **Effort:** `[M]`

### 9. iOS/Android native wrapper or web widget
React Native / Expo wrapper for background battery refresh, widgets, CarPlay. Or iOS WidgetKit via SwiftUI calling `/api/vehicles/[id]/state`.
- **Effort:** `[XL]`

### 10. Real-time vehicle telemetry via Tesla Fleet Telemetry
Currently polls every 30s. Tesla Fleet Telemetry WebSocket provides sub-second updates. Requires Tesla Fleet API approval.
- **Effort:** `[XL]`

### 11. Home energy monitoring (Shelly, Fronius, SolarEdge)
MQTT/API integration for precise kWh-per-session attribution without OCR guesswork.
- **Effort:** `[XL]`

### 12. Non-Tesla brand support
BMW ConnectedDrive or Polestar as a second brand in the registry (profiles on `demo-brands-archive`).
- **Effort:** `[XL]`

### 13. Admin / analytics dashboard
PostHog or a Supabase-backed admin page to track OCR error rates and feature usage.
- **Effort:** `[M]`

### 14. Playwright smoke CI gate
`npm run test:e2e` runs `e2e/smoke.spec.ts` (no credentials needed) but is not yet required by CI to pass before merge. Add to CI pipeline and add the `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` authenticated spec in a future step.
- **Effort:** `[S]`

---

## ✅ Completed

### Core platform
- Auth — NextAuth v5 + Supabase session bridge, Google OAuth + email/password
- Mock vehicle simulator — tick-based engine, 4 scenarios, multi-step interpolation
- Tesla OAuth (PKCE) — state binding, CSRF protection, token encryption at rest
- Tesla live vehicle data — `fetchVehicleData` polling every 30s, wake-up retry
- Vehicle commands — mock + live Tesla wiring via `TESLA_COMMAND_MAP`; 18 command types
- VCP error surfacing — HTTP 412 + `CommandsLimitedBanner`
- Capability model — `NONE→VEHICLE→LIVE→TARIFF→COMMANDS` ladder + `FeatureGate`
- Global vehicle context — `VehicleContext` + `localStorage`-persisted selection
- Mobile bottom nav — `BottomNav` + `SlideUpMenu` "More" sheet
- Scenario switcher — change mock scenario after add; odometer carried over

### i18n & UX
- next-intl v4 — nested JSON, `ro`/`en`/`de`/`hu`/`fr` locales
- Multi-currency — RON/EUR/USD/GBP/CHF/NOK/SEK/DKK/HUF via `CurrencyPicker`; BNR rate client
- Flux 2027 dark-only design system — forced dark theme, GlassCard, CircularProgress, `map-ui`
- PWA / home screen installability — `manifest.ts`, service worker, install banner (Android + iOS)

### Money & energy
- OCR pipeline — upload → Supabase Storage → Anthropic Claude (two-pass: energy + car) → `documents` table
- Email ingest — Cloudmailin webhook → OCR pipeline (`after()` for background task)
- WhatsApp OCR ingest — `/api/documents/inbound-whatsapp` Twilio webhook, migration 011
- Cost aggregation — cost/km home/public/blended, petrol comparison
- Home bill attribution — proportional EV kWh from bills
- SmartChargeCard — cheapest window recommendation + `PriceCurveChart`
- Romanian tariff providers — Electrica, E.ON ToU, Enel, Hidroelectrica (mock price curves)
- Stripe billing — Checkout, Customer Portal, webhook (`subscription_tier`, Free/Pro)
- CSV export — `/api/costs/export?vehicleId=…`

### Vehicle vault
- Per-vehicle document vault — RCA, CASCO, ITP, rovinieta, vignettes, talon, 18 types total
- Car OCR — plate, validity dates, issuer, amount, seria_polita, bonus_malus
- Coverage Shield — SVG ring showing % of mandatory docs (RCA, ITP, Rovinieta) valid
- Calendar export — `/api/vehicles/[vehicleId]/vault/calendar` ICS with 30-day + 7-day alarms
- Insolvent-insurer warning — Euroins România, City Insurance
- RCA renewal link — iasig.ro comparison when RCA expires within 45 days
- Manual vault entry — `POST /api/vehicles/[vehicleId]/vault` with type + metadata

### Charger data platform
- PostGIS charger DB — deduplicated, confidence-scored; 6 national open-data sources + OCM + OSM
- Charging map — full-screen map, PostGIS viewport query, cluster pins, filter bar, detail sheet, Send to Car
- Real trip routing — OSRM / ORS / TomTom; multi-strategy (fastest/balanced); alternative roads
- Real weather derating — Open-Meteo, piecewise-linear cold model
- Personal efficiency calibration — kWh/100km from charging + trip history
- Unified map (`/map`) — trip planner + charger browser in one sheet-based UI
- Geocoding proxy — `/api/geocode` Nominatim + Photon, 600 req/h/user

### Planning & settings
- Trip planner — ABRP-style, SoC-aware, charging stops, petrol comparison, Send to Tesla
- Insights page — savings/CO₂, activity, battery health, efficiency; 4 periods
- GDPR data export + account deletion — `/api/user/export` + `/api/user/delete`
- Settings — locale, currency, home location, tariff, vehicles, billing, notifications, danger zone

### Notifications
- Multi-channel push/email/WhatsApp — Resend + Twilio; rain+windows / freeze / heat / hail alerts
- Poll-vehicles cron — `/api/cron/poll-vehicles` every 15 min; `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` flag

### Security & infra
- Security audit — findings resolved; auth on every route, user_id scoping, webhook header-only
- Rate limiting — `checkRateLimit(userId, bucket, max)` on all API routes
- CSP — per-request nonce via `src/proxy.ts` (Next.js 16 Proxy convention)
- E2E tests — Playwright suite in `e2e/` (smoke, auth, garage, costs, trip)
- DB migrations 001–030 — full schema through manual document source
