# Flux — Product TODO

_Last updated: 2026-06-24_

---

## 🔴 Critical / Blockers

### 0. Go-live gate — must clear before real customers
Tracked in full in `docs/LAUNCH-CHECKLIST.md`. Open items as of 2026-08-07:

- [x] **Serve the partner public key** — `/.well-known/appspecific/com.tesla.3p.public-key.pem`
      now exists (it did not, though `tesla-proxy/README.md` assumed it did).
      Tesla fetches it during partner registration and Virtual Key pairing, so
      nothing else Tesla-side could have worked without it. Needs
      `TESLA_PUBLIC_KEY`; answers 503 when unset rather than an empty 200.
- [ ] **`/connect/tesla` shows the raw error code, not what to do.** The page
      renders `t("error", { code })`, so a driver who hits `fleet_api_rejected`
      or `no_vehicles` sees a slug. Needs a hint per known code, in all five
      locales. Not urgent while the maintainer is the only one linking, but it
      is the first thing a real customer would see go wrong.
- [ ] **Set the Tesla env vars and register the partner account** — full ordered
      procedure in `docs/VEHICLE-CONNECTION.md` ("Going live with the Fleet
      API"). The debug panel reports the same checklist as `tesla.steps` and
      names the first unmet one.
- [ ] **Deploy `tesla-proxy` on Fly.io** and set `TESLA_PROXY_BASE_URL`. Without
      it every command on a Model 3/Y/S/X built after 2021 fails with
      `VCP_REQUIRED` (412). See `tesla-proxy/README.md`.
- [ ] **Set `LIVE_INTEGRATIONS=tesla`** — the switch from the mock simulator to
      the real Fleet API. Everything else Tesla-side is already in-tree.
- [ ] **Re-enable subscription limits** in `src/lib/subscription.ts`
      (`canUploadDocument` / `canUploadVaultDocument` are `TODO(live)` stubs
      returning `{ allowed: true }`). Restore the pre-9715eb1 bodies.
- [ ] **Stripe live keys** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`. The debug
      panel reports `stripe: false` today.
- [ ] **Tesla security hardening before linking real accounts** — see item 1b.

### 1f. A live vehicle records no charging sessions
`charging_sessions` rows are written in exactly two places: the simulator
(`src/lib/mock/persistence.ts`, on a mock tick) and the Supercharger sync
(`dx/charging/history`). The live state route records battery health and nothing
else — so once a car is linked, home and third-party charging is never captured
at all, and the only history it can ever show is Supercharger sessions.

The empty state ("sessions appear here once the car has been connected while the
dashboard was open") describes the simulator's behaviour and is simply wrong for
a linked car. That is worse than an empty list: it tells the driver to do
something that will not help.

Two ways to close it, and they pull in opposite directions:
  * Detect start/stop from the live poll, as the simulator does. Cheap to build,
    but only sees what polling sees — and polling now stops after ten idle
    minutes precisely so the car can sleep, so an overnight home charge is
    invisible either way.
  * **Fleet Telemetry** — the car pushes to an endpoint instead of being polled.
    Continuous history AND no waking, which is the only option that solves both
    at once. Needs its own configuration and a receiver.

Until one of them exists, "istoricul de încărcare" is a promise the live
integration does not keep.

### 1e. Fleet API data we do not fetch yet
The integration currently asks for four `vehicle_data` sub-endpoints
(`charge_state`, `climate_state`, `drive_state`, `vehicle_state`) and
`dx/charging/history`. Worth having, roughly in value order:

- **`nearby_charging_sites`** — Superchargers near the car *with live stall
  counts*. This is a partial answer to "no real-time availability from any
  source", which is listed elsewhere here as the planner's largest data gap and
  as needing a commercial feed. It only covers Tesla's own network and only
  around a linked car, but that is more than zero and costs nothing.
- **`vehicle_config`** — model, trim, wheels, battery type. Would let the
  planner stop guessing consumption from the display name.
- **`charge_schedule_data` / `preconditioning_schedule_data`** — the schedules
  already set in the car. Today the app writes schedules without being able to
  read what is there, so it cannot show the driver their own settings.
- **`service_data`**, **`release_notes`** — service state and firmware notes.

Not available however much we would like it: **historical consumption**. Tesla
exposes no trip or energy history endpoint, so the efficiency figures have to be
accumulated from polling over time, or come from Fleet Telemetry (a streaming
product with its own setup). `dx/charging/history` covers Supercharger sessions
only — home and third-party charging never appears there, which is worth saying
in the UI rather than leaving an empty list that looks broken.

### 1d. Polling wakes a sleeping car every 30 s
`useVehicle` polls `refetchInterval: 30_000`, and `fetchVehicleData` answers a
408 by calling `wake_up` and retrying. So an open dashboard keeps a linked car
awake indefinitely — a Tesla that never reaches deep sleep loses roughly ten
times more charge per idle day. TanStack pauses the interval when the tab loses
focus (`refetchIntervalInBackground` defaults false), so the exposure is bounded
to "screen open and focused", but that is still the normal way someone watches a
charge finish.

Worth doing before real customers: back off the interval for live vehicles, and
do not `wake_up` on a background refresh — only when the driver explicitly asks.
The mock path is unaffected; this only matters once cars are real.

### 1c. Linking only imports the first vehicle
`src/app/api/tesla/callback/route.ts` takes `list.response[0]` and stops, so an
owner with two Teslas gets one and no way to add the other — the garage's "add
vehicle" path creates a mock, not a linked car. Fine while the maintainer is the
only user; a visible defect the first time a two-car household signs up. The fix
is to insert every vehicle in the list and let the garage deactivate the ones
they do not want.

### 1b. Tesla account security (before real customers link a car)
Linking grants `vehicle_device_data`, `vehicle_cmds` and
`vehicle_charging_cmds` (`src/lib/tesla/constants.ts`), i.e. live location plus
lock/unlock, climate, charge port and remote start. Tokens are encrypted at rest
(AES-256-GCM via `TESLA_TOKEN_ENCRYPTION_KEY`), so a database leak alone is not
enough — but a leak of that key alongside it is.

Done (2026-08-07):
- [x] In-app disconnect — `DELETE /api/tesla/connection` revokes each refresh
      token at Tesla then deletes the stored rows; UI in Settings → Advanced.
- [x] Command audit surfaced — `GET /api/vehicles/[id]/command-history`,
      rendered under the controls on `/commands`.
- [x] Confirmation before `unlock` and `remote_start`.

Still open:
- [ ] **Consider dropping `vehicle_cmds`** for accounts that only want cost and
      trip tracking — read-only linking removes the entire unlock risk class.
      Needs a scope choice at connect time and a capability model that tolerates
      a live-but-read-only vehicle.
- [ ] **Rotate `TESLA_TOKEN_ENCRYPTION_KEY` procedure** — document how, and
      re-encrypt existing rows.
- [ ] **Rotate the command-signing keypair before real customers.** The pair in
      use was generated in an assistant session and its private half passed
      through a chat transcript, which is fine for a maintainer testing their own
      car and not fine once it can unlock somebody else's. Generate a fresh pair
      on a trusted machine, set `TESLA_PUBLIC_KEY` from it, put the private half
      in the Fly secret, re-pair the Virtual Key, and confirm with the panel's
      "Check status" that Tesla reports the same point.
- [ ] **Work out how to rotate the key at Tesla.** `POST /api/1/partner_accounts`
      for an already-registered domain returns the existing record untouched —
      observed with a two-month-old key while a new one was being served. Whether
      the partner record's stale key actually blocks anything is unconfirmed: the
      car gets its Virtual Key from the domain at pairing time, so car↔proxy may
      be the only pair that has to agree. Establish which before relying on it.
- [x] Notify on sensitive commands — `alertOnSensitiveCommand` fires on a
      successful `unlock` or `remote_start` through whichever channels the owner
      has enabled. Requires `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` and at least one
      channel configured, otherwise it is a no-op.

### 1. Tesla VCP proxy — Vehicle Command Protocol for post-2021 cars
Commands (lock, climate, horn, charge limit) silently fail with `VCP_REQUIRED` (HTTP 412) on every Model 3/Y/S/X built after mid-2021. The code in `src/lib/tesla/api.ts` already branches on `TESLA_PROXY_BASE_URL`; the `tesla-http-proxy` Go binary needs to be deployed on Fly.io and the env var set.
- **Effort:** `[L]` — infra only, no code changes needed

---

## 🟠 Finish unifying the two trip planners (2026-08-07)

The planner exists on `/trip` and as the Plan tab on `/map`. Three bugs in a row
came from a feature landing on one screen only — most seriously, `/map` decided
preconditioning from the first stop alone while `/trip` checked every stop, so a
route starting at a Supercharger arrived cold at the next DC charger.

Shared so far: `src/lib/trip/{share-route,precondition,snapshot}.ts`, plus
`useSavedRoutes`. `/map` now has share, save, clear, preconditioning, corridor
stations and long-press area loading.

- [x] Saved-routes browser ported (`src/components/trip/SavedRoutesSheet.tsx`).
- [x] Manual precondition ported.
- [x] `/trip` retired — redirects to `/map?mode=plan`; Sidebar entry removed.
      The page is kept as a redirect so existing links and bookmarks survive.

Remaining from the old `/trip` and deliberately not carried over: the
preconditioning disclaimer (its text is now covered by the manual button being
visible) and the recent-destinations dropdown, which `/map` has its own search
affordances for. Raise either if they turn out to be missed.

## 🟠 Loose ends from the charger-data work (2026-08-07)

Recorded so they are not lost — none block launch.

- [x] **IRVE (France) rewritten for the CSV it actually serves.** The resource
      is `text/csv`, 163 MB, schema `irve-statique-v2.3.1`, one row per charge
      point. Now stream-parsed and aggregated per `id_station_itinerance` in the
      scheduled bulk import; the per-tile path returns nothing, because
      answering one map tile cannot mean downloading 163 MB.
- [x] **NDW (Netherlands) rewritten.** The endpoint works; three faults hid it:
      no geographic gate (so ingesting Greece queried a Dutch service), a
      whole-country bbox the API rejects, and a mapping written against a schema
      it does not return. Its `availabilities[]` carries live stall counts —
      the first source in-tree that could feed real-time availability.
- [x] **Chargers with no `charger_sources` row** — was 6,300, then 1,160 after
      the first dedupe, which confirmed the cause: the orphans were duplicate
      rows whose refs had been claimed by the survivor. Migration 043 makes the
      dedupe *transfer* refs to the survivor instead of cascading them away, and
      recomputes `source_count` from the table rather than trusting the payload.
      Remaining gap: in a chain longer than the merge radius the best neighbour
      can itself be deleted in the same pass, and those refs still cascade —
      re-ingest recovers them.
- [ ] **BNetzA source is disabled**, not fixed — but there is a lead now. The
      base URL answers **200 with Swagger UI HTML**, not 404: it is an API
      documentation page whose spec is at `openapi.yaml`, and the connector was
      pointed at the docs rather than the data. Probe `bnetza-openapi` in the
      debug panel to read the spec and recover the real endpoint, then set
      `BNETZA_URL`.
- [ ] **TomTom never reaches bulk-imported countries.** It only contributes on
      the lazy tile path, which bulk-fresh countries skip; its categorySearch is
      a nearest-first radius query, so sweeping a country with it returns a
      centre-biased sample. Closing this needs a bulk-oriented TomTom product.
- [ ] **~5,400 chargers still carry no country.** Rows stored before the OCM
      `compact=false` fix keep their old values until their area is ingested
      again, and OSM supplies no country at all. Cosmetic — country is not used
      by the map or the planner.
- [ ] **Austria's source is gone.** `gis.bgld.gv.at` answers
      `{"reason":"No site configuration found."}` to everything — the whole
      ArcGIS service, not just the layer. Now gated behind `AUSTRIA_URL` like
      BNetzA. It was only ever Burgenland, so no national register is lost;
      finding a real Austrian one is still open.
- [ ] **No real-time availability from any source.** Nothing tells a driver
      whether a stall is free. This is the single largest data gap for the trip
      planner; it needs Hubject/intercharge or Eco-Movement, both commercial.
- [ ] **Overpass is slow.** 15 s timeout after 9 s proved too short; it still
      returns nothing for some windows.
- [ ] **A shared generic suffix inflates operator similarity.** `operatorSimilarity`
      is normalized edit distance over the whole slug, so "Ionity Charging" vs
      "Enel X Charging" scores ~0.67 — above the 0.5 conflict threshold — and
      the two merge at same-site range. This is the *opposite* failure to the
      duplicates reported from the field: it hides a station rather than
      doubling one, which is why it is not urgent, but it is the same root
      cause (generic words treated as identity). The fix is to strip
      `GENERIC_BRAND_TOKENS` before measuring distance. Found while writing the
      Nea Kerdilia guard tests, not from field data — worth confirming against
      real rows before changing the threshold behaviour for every operator.

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
