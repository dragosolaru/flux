# Flux — Product TODO

_Last updated: 2026-05-24_

---

## 🔴 Critical / Blockers

### 1. Tesla VCP proxy — Vehicle Command Protocol for post-2021 cars
Commands (lock, climate, horn, charge limit) silently fail with `VCP_REQUIRED` (HTTP 412) on every Model 3/Y/S/X built after mid-2021. The code in `src/lib/tesla/api.ts` already branches on `TESLA_PROXY_BASE_URL`; the `tesla-http-proxy` Go binary needs to be deployed on Fly.io and the env var set.
- **Effort:** `[L]` — infra only, no code changes needed

### 2. Smoke / E2E test suite is missing
No Playwright tests exist. Any regression (auth, add vehicle, upload doc) goes undetected in CI.
- **Effort:** `[M]`

---

## 🟡 High Priority — Next Sprint

### 3. Real Tibber API integration (live tariff prices)
Replace `tibber-mock` with a real Tibber GraphQL client. The `TariffProvider` interface is the right shape; adding a real provider flips `hasTariff = true` and unlocks the Energy page for Tibber users.
- **Effort:** `[M]`

### 4. WhatsApp OCR ingest via Twilio webhook
`IngestCard` shows a WhatsApp CTA but there is no webhook. The email pipeline already does the heavy lifting; a new route `/api/documents/inbound-whatsapp` needs to accept Twilio Media and call `processDocument`.
- **Effort:** `[M]`

### 5. VehicleCard image / avatar is absent
`VehicleCard` and `VehicleListCard` render brand name text but no vehicle silhouette or image. A static SVG per Tesla model (Model 3, Y, S, X) would noticeably improve garage and dashboard UX.
- **Effort:** `[S]`

### 6. Computed trip metrics: Wh/km display
`CostDashboard` shows cost/km but efficiency (Wh/km) is not displayed anywhere. The data exists (`total_kwh`, odometer snapshots); only the UI surface and KPI aggregation are missing.
- **Effort:** `[M]`

### 7. State of Health (SoH) estimate for Tesla
`BatteryHealthCard` renders `batteryHealthPct` but the live Tesla mapping returns `null`. Tesla does not expose SoH directly; estimate from `battery_range / rated_range`. Estimation logic + DB persistence both missing.
- **Effort:** `[M]`

### 8. Tesla charging history sync — no automatic scheduling
`useChargingHistorySync` is manual (button). No background job or cron auto-syncs after each session ends. Users who forget will have gaps.
- **Effort:** `[M]`

### 9. Smart charge — auto-start via Tesla command
`SmartChargeCard` shows a recommendation but has no "Schedule now" button that sends `set_scheduled_charging` to the Tesla API.
- **Effort:** `[M]`

---

## 🟢 Medium Priority

### 10. Trip planner uses mock routing and mock weather
`mockRouter.computeRoute()` does Haversine math; `mockWeather` returns a fixed snapshot. Replace with OSRM/GraphHopper (routing) and Open-Meteo (weather) — both free tiers.
- **Effort:** `[L]`

### 11. Charging map uses static hardcoded stations (~50)
Integrate OpenChargeMap API (free, 300k+ POIs) to replace the hardcoded array.
- **Effort:** `[L]`

### 12. Vehicle simulator scenario switcher
Users can pick a scenario when adding a mock vehicle but cannot change it afterwards. A scenario switcher in Settings or the Garage card would improve demo usability.
- **Effort:** `[S]`

### 13. Smart charge multi-vehicle coordinator
`SmartChargeCard` renders each vehicle independently. For users with two EVs on one circuit, recommendations should be staggered to avoid overloading.
- **Effort:** `[M]`

### 14. Charging map availability disclaimer
Availability is simulated (deterministic pseudo-random). A "Simulated availability" disclaimer would improve trust without requiring a real OCPI feed.
- **Effort:** `[S]`

### 15. PWA / home screen installability
No `manifest.webmanifest`, no service worker. The mobile BottomNav exists but users cannot add Flux to their home screen as an app icon.
- **Effort:** `[M]`

### 16. In-app notifications for charging events
No push notification fires when charging completes or when the cheap tariff window opens.
- **Effort:** `[L]`

### 17. GDPR data export and account deletion
`DangerZone` in settings only disconnects vehicle. A full "download my data" + "delete my account" flow is needed before EU public launch.
- **Effort:** `[M]`

### 18. Rate limiting and abuse protection
No rate limiting on document upload, OCR, or Tesla command proxy routes. Add per-user limits via Upstash Redis or Vercel Edge Middleware.
- **Effort:** `[M]`

---

## ⚪ Planned / Future

### 19. Subscription model (Stripe)
Freemium (1 mock vehicle free) + Pro ~€4.99/month. Needs Stripe Checkout, webhook handler, `subscription_tier` column, capability checks updated.
- **Effort:** `[XL]`

### 20. iOS/Android native wrapper or web widget
React Native / Expo wrapper for background battery refresh, widgets, CarPlay. Or iOS WidgetKit via SwiftUI calling `/api/vehicles/[id]/state`.
- **Effort:** `[XL]`

### 21. Real-time vehicle telemetry via Tesla Fleet Telemetry
Currently polls every 30s. Tesla Fleet Telemetry WebSocket provides sub-second updates. Requires Tesla Fleet API approval.
- **Effort:** `[XL]`

### 22. Home energy monitoring (Shelly, Fronius, SolarEdge)
MQTT/API integration for precise kWh-per-session attribution without OCR guesswork.
- **Effort:** `[XL]`

### 23. Non-Tesla brand support
BMW ConnectedDrive or Polestar as a second brand in the registry.
- **Effort:** `[XL]`

### 24. Admin / analytics dashboard
PostHog or a Supabase-backed admin page to track OCR error rates and feature usage.
- **Effort:** `[M]`

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
- Mobile bottom nav — `BottomNav` + `SlideUpMenu`
- Dark/light theme — `next-themes`

### i18n & UX
- next-intl v4 — nested JSON, `ro`/`en`/`de`/`hu`/`fr` locales (121 keys each)
- Multi-currency — RON/EUR/USD/GBP/CHF/NOK/SEK/DKK/HUF via `CurrencyPicker`; BNR rate client
- CommandPanel i18n — all button labels via `t("commands.*")`
- Costs page i18n — title, empty states, export button

### Money & energy
- OCR pipeline — upload → Supabase Storage → Anthropic Claude → `documents` table
- Email ingest — Cloudmailin webhook → same OCR pipeline (`after()` for Vercel lifecycle)
- Cost aggregation — cost/km home/public/blended, petrol comparison
- Home bill attribution — proportional EV kWh from bills
- SmartChargeCard — cheapest window recommendation
- PriceCurveChart — 24h tariff bar chart
- Romanian tariff providers — Electrica, E.ON ToU, Enel, Hidroelectrica (4 real providers)
- CSV export — `/api/costs/export?vehicleId=…`
- Upload visual feedback — spinner + "Se încarcă…" during upload

### Vehicle & charging
- Tesla charging history sync — manual sync button + `POST /api/vehicles/[id]/charging-history`
- CostDashboard — monthly trend, home vs public split, petrol equivalent
- Virtual Key flow — `virtual_key_paired` badge + "Mark as paired" button in `VehicleListCard`
- Dashboard live indicators — "Live" badge, odometer, location tile, "Demo data" vs "Live · 30s"
- StatsGrid — combined temp tile (interior + exterior), odometer, location

### Planning
- Trip planner — mock routing (Haversine), weather derating, charging stop insertion
- Charging map — Leaflet + ~50 EU stations, mock availability, network/kW filters

### Settings & infra
- Settings page — locale, currency, home location (Nominatim), tariff provider
- Security audit — 17 findings resolved (migrations 005, 007; RLS policies, token encryption, CSRF)
- DB migrations 001–010 — initial schema through `sender_email` column
- `SCHEMA_FULL.sql` — consolidated idempotent schema for all 14 tables
