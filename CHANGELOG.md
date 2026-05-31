# Changelog

All notable changes to Flux are documented here.

---

## 2026-05-25 — Sprint: Security hardening + new features

### Bug fixes
- `FleetTotalsCard`: infinite loading skeleton replaced with "Fleet data unavailable" on query error
- `ChargingStatus` + charging page: separate loading/error/empty states (no more eternal skeleton)
- `DepartureCard`: gate moved from `COMMANDS` to `LIVE` — preconditioning and scheduled departure work via Fleet API OAuth, no VCP proxy required

### New features
- **WhatsApp OCR ingest**: `/api/documents/inbound-whatsapp` Twilio webhook, media download with Basic auth, same `processDocument` pipeline as email (migration 011: `sender_phone` column + `whatsapp` source)
- **OpenChargeMap API**: `/api/charging-stations` route — auth + rate limiting + geolocation; charging map fetches 300k+ real POIs instead of ~50 hardcoded stations
- **In-app notifications**: `useVehicleNotifications` toasts on `charging → complete`; `useSmartChargeNotifications` toasts when cheapest tariff window opens
- **i18n**: `settings.danger_zone` and `tibber` provider key filled in for de/fr/hu locales

### Security
- Open redirect in `LoginForm` fixed: `callbackUrl` validated to start with `/`
- Email IDOR: `findVehicleByNickname` scoped to resolved user
- Webhook secret: `x-webhook-secret` header only (removed `?secret=` query param fallback)
- `getValidAccessToken` threads `userId` for defense-in-depth ownership check
- Rate limiting on all Tesla routes: state 120/hr, commands 30/hr, charging-history 20/hr, charging-map 60/hr

---

## 2026-05-24 — A.1: UI Gating, Capability Model, Mobile-First, i18n, Multi-Currency

### Summary
Complete UI overhaul laying the product foundation. Fake data is now hidden behind
capability gates. Mobile bottom navigation, i18n (RO/EN/DE/HU/FR), multi-currency
display (RON/EUR/USD/GBP/CHF/NOK/SEK/DKK/HUF), and framer-motion animations throughout.

### New Features

**Capability Model**
- 5-tier capability levels: `NONE → VEHICLE → LIVE → TARIFF → COMMANDS`
- `checkCapability(required, ctx)` pure function — no I/O, easy to test
- `/api/me/capabilities` — server computes context from DB, returns gate result
- `useCapabilities()` hook with 30 s stale time
- `FeatureGate` client component: renders children when gate passes, `CapabilityEmptyState` otherwise
- `CapabilityEmptyState` — 4 animated variants with floating icon (framer-motion `floatLoop`)

**Mobile Navigation**
- `BottomNav` — 5-tab bottom navigation for mobile, hidden on `md:` and above
- Animated sliding pill indicator via framer-motion `layoutId="bottom-nav-indicator"`
- Safe-area-inset padding for iPhone notch
- `SlideUpMenu` — drag-to-dismiss bottom sheet with framer-motion + body overflow lock
- All dashboard pages get `pb-24 md:pb-6` so content clears the nav bar

**i18n**
- `next-intl` v4 integration (cookie-based locale, clean URLs)
- Supported locales: `ro`, `en`, `de`, `hu`, `fr` (Romanian default)
- ~70 translation keys: nav, empty states, onboarding, settings, ingest, commands, garage
- `LocalePicker` in Settings — updates DB + cookie + page refresh in a single transition
- Locale resolution order: DB profile → `Accept-Language` header → `'ro'`

**Multi-Currency**
- Supported: RON, EUR, USD, GBP, CHF, NOK, SEK, DKK, HUF
- `formatMoney()` / `formatMoneyCompact()` via `Intl.NumberFormat`
- `convertCurrency()` async via BNR rates; `convertCurrencySync()` for render-time use
- `CurrencyPicker` in Settings — persisted to DB profile

**Settings Page**
- New "Preferences" card: locale picker + currency picker
- New "Home location" card: `HomeLocationPicker` with Nominatim geocoding (OpenStreetMap)
- Anchor links: `#tariff`, `#home-location`

**Onboarding & Garage**
- Hero onboarding screen when no vehicles added (animated, i18n CTA)
- Tariff hint hidden when user has no real tariff provider
- Stagger animations on vehicle card list

**Ingest**
- `IngestCard` — unified 3-option ingest card (Camera / Email / WhatsApp)
- Replaces separate `DocumentUploadZone` + `EmailInbox` on costs page
- Click-to-copy email address with `whileTap` animation

**Commands Page**
- New `/commands` route — per-vehicle `CommandPanel` behind `FeatureGate(COMMANDS)`
- Dashboard inline `CommandPanel` now gated; hidden cleanly when COMMANDS unmet

**Animations**
- `MotionConfig reducedMotion="user"` at root (respects OS preference)
- `BatteryGauge` — full framer-motion rewrite with animated SVG arc + counter
- `MockGlobalBanner` — indigo gradient, AnimatePresence, session-storage dismiss
- Shared animation variants: `pageVariants`, `cardVariants`, `staggerContainer`, `fadeInUp`, `tapShrink`, `slideUp`, `floatLoop`
- Energy + Costs + Garage pages wrapped in `motion.div variants={pageVariants}`

### Infrastructure

**Database** (`supabase/migrations/008_user_preferences.sql`)
- `profiles`: added `locale`, `display_currency`, `home_address`, `home_lat`, `home_lng`
- `vehicles`: added `virtual_key_paired` (required for COMMANDS capability)
- `charging_sessions`: added `is_home_charge`
- ⚠️ **Run this migration in Supabase SQL Editor before deploying**

**APIs**
- `GET /api/me/capabilities` — returns `{ hasVehicle, hasLiveVehicle, hasTariff, hasCommandsReady }`
- `GET/PATCH /api/me/preferences` — locale, displayCurrency, homeAddress, homeLat/Lng

### Security Fixes (bundled from prior review)
- Full-UUID email subaddress now accepted (was rejected by `SHORT_ID_RE`)
- `findUserByEmailLocalPart` uses exact match (no normalization collision)
- Background-tab polling stopped (`refetchIntervalInBackground: false`)
- `verifyState()` crash on missing `NEXTAUTH_SECRET` caught and surfaced as auth failure
- `averageConfidence()` no longer divides by zero on empty confidence object

---

## 2026-05-20 — Security Audit Pass

- 15 findings identified and resolved (see `docs/SECURITY-AUDIT.md`)
- DB reset script: `supabase/reset-data.sql`

---

## Road Map

| Phase | Description | Status |
|-------|-------------|--------|
| A.1 | UI gating, capability model, mobile-first, i18n, multi-currency | ✅ Done |
| A.2 | Tesla live reactivation — OAuth QA, FeatureGate(LIVE) unlock | 🔜 Next |
| A.3 | Charging history sync (`/api/1/dx/charging/history` cron) | Planned |
| A.4 | Live vehicle data polling (`vehicle_data` endpoint) | Planned |
| A.5 | Computed metrics: Wh/km, cost/km, trip cost, SOH estimate | Planned |
| B.0 | WhatsApp OCR via Twilio webhook | Planned |
| B.1 | Romanian energy tariff DB (Enel, E.ON, CEZ, Electrica, Hidroelectrica) | Planned |
| B.2 | Smart charging recommendations backed by real tariff | Planned |
| C | Vehicle commands: window control + alert, preconditioning, automations | Planned |
| D | Competitive differentiators: SOH tracking, charge limit, carbon tracker | Planned |
| E | Billing: Stripe, Free vs Premium (~30 RON/month) | Planned |
