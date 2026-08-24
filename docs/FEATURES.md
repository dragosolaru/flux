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
- [26. v2 redesign (`/v2`)](#26-v2-redesign-v2)

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
| `/map` | Unified map | station browser (Explore) + trip planner (Plan). `/trip` redirects here |
| `/settings` | Settings | locale, currency, home, tariff, vehicles, billing, notifications, account |
| `/about-data` | About your data | privacy / data transparency page |

Public pages outside the dashboard group: `/` (landing), `/pricing` (product), `/login`, `/register`.

Nav: desktop `Sidebar` (sections Vehicle / Costs / Planning + Settings/About); mobile `BottomNav` (Car · Map · Charging · More) with a `SlideUpMenu` "More" sheet for secondary destinations.

---

## 1. Authentication

**What:** Email/password and Google sign-in via NextAuth v5. Sessions are JWT; the JWT callback resolves the Supabase `auth.users` UUID at sign-in and bakes it into the token (bridged by `ensureSupabaseUserId`). Write routes (tariffs settings, vehicle PATCH/DELETE) re-resolve via `ensureSupabaseUserId` for safety.

**How to use:** UI `/login`, `/register`. API: `POST /api/auth/register` (creates Supabase auth user, IP rate-limited 5/hr), `GET/POST /api/auth/[...nextauth]` (NextAuth handlers).

**Deep links:** the `(dashboard)` layout sends anonymous visitors to `/login?callbackUrl=<path>` (path read from the `x-pathname` header set in `src/proxy.ts`). `LoginForm` validates `callbackUrl.startsWith("/")` before `router.replace()`, so an off-origin value is ignored. This is what makes bookmarks into `/trip` and `/map?mode=plan` survive sign-in.

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

**What:** Remote commands: lock/unlock, climate on/off + temp, honk, flash, charge limit/amps, start/stop charging, charge port open/close, vent/close windows, sentry on/off, remote start, schedule charging/departure, precondition max, and `share_navigation` (Send to Tesla → maps to Tesla `navigation_gps_request`). Every command is gated on `BrandCapabilities`. `useVehicleCommand` applies optimistic cache updates (lock/unlock, climate, charging, set_charge_limit) with rollback on error, redirects to `/login` on 401, and maps failures to stable i18n keys (`commands.error_rate_limit`, `error_vcp_required`, `error_proxy_missing`, `error_not_supported`) so raw Tesla Fleet text never leaks.

**A revoked grant is detected on the data call, not only on refresh.** Revoking at tesla.com invalidates the access token immediately, but the stored row still has a future expiry — so `getValidAccessToken` returns the dead token without refreshing and raises no `TeslaAuthError`. `fetchVehicleData` now maps Tesla's **401** (and **403**, which on a data endpoint means a scope was never granted) to `TeslaAuthError`, so the route answers 409 and the dashboard shows "access revoked → reconnect" instead of "check your connection". `sendVehicleCommand` does the same on 401. Pinned by tests in `src/lib/tesla/__tests__/map-vehicle-data.test.ts`.

**`virtual_key_paired` finally means something.** The column has existed since migration 008 with a `useVirtualKeyPair` hook and a PATCH endpoint, and nothing ever read or wrote it. It is now set `true` the first time the car accepts a signed command — the only proof of pairing available, since Tesla exposes no way to ask — so the dashboard prompts a live car that has never had one work, and stops once one does.

**Virtual Key pairing lives in the app, not only in `/debug`.** The URL is per **domain**, not per vehicle — one link pairs every car — but each car must be approved individually by whoever sits in it, so an admin-only panel was the wrong home. The dashboard shows it as a card under the quick actions, and only after a command has actually been refused with `VCP_REQUIRED`: Tesla offers no way to ask whether a car is paired, so a permanent prompt would be clutter for everyone who already did it. **There is no unpair API** — removal is the car's Locks screen, or revoking the app under Tesla account security, which immediately ends command access. `DELETE /api/tesla/connection` does the latter.

**Two causes behind one Tesla error.** `412 Vehicle Command Protocol required` means either "nothing signed this command" or "signed, but the car has not paired the key". The routes split them on whether `TESLA_PROXY_BASE_URL` is set — `PROXY_NOT_CONFIGURED` (operator deploys the proxy) vs `VCP_REQUIRED` (owner pairs the Virtual Key on their phone). One message covered both and named the Virtual Key, which is the wrong fix for the commoner case. `/debug` → "Go live with Tesla" builds the pairing link from `TESLA_REDIRECT_URI`'s host via `teslaVirtualKeyUrl()`.

**Signing proxy (`tesla-proxy/`).** Deployable on **Coolify** (`docker-compose.yaml`, one secret to fill in) or **Fly** — see `tesla-proxy/README.md`. It runs two processes on purpose: `tesla-http-proxy` only speaks TLS (upstream omitted an `--insecure` flag deliberately) while both platforms terminate the public certificate at their edge and forward plain HTTP, so pointing them at each other yields a bare `400`. The signing proxy binds loopback `127.0.0.1:8443` with a self-signed cert and Caddy publishes plain HTTP on `$PORT` in front of it; verification is skipped only on that loopback hop. Needs a publicly reachable hostname with a valid certificate, because the callers are Vercel functions with no fixed egress IPs.

**The proxy URL must be https.** `teslaProxyBaseUrl()` throws on a plaintext `TESLA_PROXY_BASE_URL` instead of using it, because every command sends the driver's live Tesla access token in an `Authorization` header — a token that can unlock and start the car — and over http that crosses the internet readable. Coolify's generated hostname arrives as `http://` until TLS is switched on for it, so this is the realistic mistake. Loopback is exempt for local development. `/debug` surfaces it as a warning and marks the `TESLA_PROXY_BASE_URL` step unmet, rather than letting it be discovered when a command fails.

**Getting the signing key in.** `TESLA_PRIVATE_KEY_FILE` (a mounted file) is preferred over `TESLA_PRIVATE_KEY` (raw PEM or single-line base64); the file wins when both are set. A PEM is five lines, and both env-var routes mangle that — a `.env` holds one line per variable, so a pasted PEM arrives **empty**, and Coolify additionally injects each env var as an `ARG` with its value as the default, printing it in the deployment log. The entrypoint validates with `openssl ec` and reports empty, unreadable-mount and not-a-key separately, so the log names the actual fault instead of blaming the key.

**Commands reflect the car, and pairs are one control.** The first version of `AllCommands` rendered a button per command, so Sentry on / Sentry off sat side by side looking identical, nothing changed appearance after a command succeeded, and the panel could not answer the question it exists for — did that work. Opposing pairs (`start`/`stop_charging`, `vent`/`close_windows`, `activate`/`deactivate_sentry`, `precondition_max` on/off) are now single stateful toggles driven by `VehicleState`, carrying the app's existing active treatment. `precondition_max` had **no off control at all** — the plumbing existed in the command map and the mock engine and no button reached it, so max defrost could be started and never stopped. `lock`/`unlock` and `climate_on`/`climate_off` were removed from the grid: `CommandPanel` owns them, and rendering both meant two independent mutations for one command 40px apart.

**Values are tapped, not dragged.** Charge limit and charging current are `Chip` rows of their real values (50–100 in tens; Tesla's 5/8/12/16/24/32/40/48). A range input gave 27px of travel per 5% inside a vertically scrolling page, which iOS frequently reads as a scroll. Tapping a value *is* the command, so the Apply step disappears with it. Cabin temperature keeps a control — a ±stepper with two 44px targets — because "one more degree" is meaningful there. Every remaining Apply button is `bg-primary`: `bg-secondary` on a card is roughly 1.25:1 in the dark theme, so the one control that committed the value was invisible in daylight.

**Controls seed from the car, or show a skeleton.** Temperature opened at a hardcoded 21 °C and scheduled charging at 23:00 while `driverTempC` and `scheduledChargingStartMinutes` both exist — a driver checking a 01:00 schedule saw "23:00", assumed it was wrong, and one tap made it wrong. Nothing renders a fabricated default now.

**All 22 commands are now reachable.** Eighteen of them were mapped, capability-flagged, rate-limited and audited end to end, and had no button anywhere: `CommandPanel` rendered exactly four (lock/unlock, climate, honk, flash). `AllCommands` on `/commands` adds the rest, grouped Access / Charging / Climate / Windows / Security, with sliders for charge limit (50–100 %), charging current (1–48 A) and cabin temperature (15–28 °C), time pickers for scheduled charging and departure (sent as minutes past local midnight), and an address box for `share_navigation` that resolves through `/api/geocode` because Tesla's `navigation_gps_request` takes coordinates, not text. `unlock` and `remote_start` keep the confirmation step.

The dashboard reaches the same set through a fourth quick-action button that expands `AllCommands` in place. `/commands` alone was not enough: on a phone it sits two taps inside the "more" overflow, so the app looked like it could do three things. Expanding beats navigating away from the screen showing the battery you are deciding against.

**Not every command can go through the signing proxy.** The proxy switches on the command name and answers `400 invalid_command` locally — without contacting Tesla — for anything it does not implement. `navigation_gps_request` is one: `pkg/proxy/command.go` handles `navigation_request` (returning `ErrCommandUseRESTAPI`, which the proxy then forwards) and has no case for the GPS variant. So "send to navigation" could never work on a proxied car. `CommandEntry` now carries `signed?: false`, `share_navigation` sets it, and `sendVehicleCommand` routes those straight to Tesla's REST endpoint addressed by numeric id. Nothing is lost: Tesla's own note in that file is that sharing endpoints "often require server-side processing, which prevents strict end-to-end authentication".

**Command routing has a test now** (`src/lib/tesla/__tests__/command-routing.test.ts`, 52 cases). It asserts URL, vehicle tag and body for every entry in `TESLA_COMMAND_MAP`, with and without `TESLA_PROXY_BASE_URL`. This decision had broken twice with nothing to catch it — commit `f08b316` sent the numeric id to a proxy that only accepts a 17-character VIN, and `share_navigation` above. Verified to fail without the fix.

**403 on a command is an auth error**, matching what the data path already did. The branch claimed the same reasoning in a comment while checking only 401; on a command endpoint a 403 means the grant never carried the scope, which no retry fixes.

**Window commands and coordinates.** `window_control` takes `lat`/`lon` as a proximity check on **Tesla's REST endpoint** — it closes windows only for a caller near the car, and `0, 0` fails that for `close`. **Through the signing proxy they are ignored entirely**: the proxy reads only `command` and calls `VentWindows`/`CloseWindows`, under an upstream comment saying coordinates are not required for vehicles on this protocol. The UI passes the car's own position, which matters on the direct path and is inert on the signed one. An earlier version of this entry claimed `0, 0` was why closing windows failed on a proxied car — that was wrong, and no such failure was ever observed.

**How to use:** UI `/commands` (full set) and `CommandPanel` on the dashboard (quick row). API: `POST /api/vehicles/[vehicleId]/commands` (UUID validate → rate limit → auth → ownership → capability check → live `sendVehicleCommand` or mock `applyCommand`). Adding a command: see the checklist in `CLAUDE.md`.

**Key files:** `src/app/api/vehicles/[vehicleId]/commands/route.ts`, `src/lib/brands/{command-map.ts,tesla/command-map.ts}`, `src/lib/mock/engine.ts`, `src/components/vehicle/{CommandPanel,AllCommands}.tsx`, `src/hooks/useVehicleCommand.ts`, `src/lib/api/vehicles.ts` (`shareNavigation` helper unifies the share_navigation + optional precondition_max sequence).

**Refresh-token single-flight now spans instances.** Tesla rotates the refresh
token on use, so two lambdas refreshing at once do not merely waste a call — the
loser writes a token Tesla has already invalidated, and the next refresh fails
`invalid_grant`, which reaches the driver as "reconnect your Tesla". The guard
was a `Map` in module scope, which is empty in the instance that races the one
holding it: `/state`, `/commands` and the cron each run in a different lambda.
A Redis `SET NX` with a 15 s TTL now fronts it; a caller that loses the lock
waits for the fresher row to appear (250 ms → 4 s) instead of making its own
call. Best-effort in both directions — no Redis configured means the previous
behaviour exactly, and a waiter that times out refreshes anyway, because a stuck
lock must never be able to lock someone out of their car.

**Per-command argument bounds.** `args` is an open record, so
`set_charge_limit` with `percent: 3`, negative amps, or a 40 °C cabin were built
into a request and sent. `ARG_BOUNDS` in the commands route validates the
commands that carry a number (percent 50–100, amps 0–48, temp 15–28, schedule
minutes 0–1439, navigation lat/lng) and answers 400. The car should not be the
thing validating this.

**Command errors are classified by body, not only by status.** Tesla answers **403** both for a missing scope and for `Vehicle Command Protocol required`. Treating every 403 as `TeslaAuthError` shadowed the VCP split entirely, because `commands/route.ts` checks `instanceof TeslaAuthError` before it string-matches — so an operator who simply had not deployed the signing proxy was told to re-authorise Tesla, which cannot fix it. `sendVehicleCommand` now checks the body first. Pinned by `src/lib/tesla/__tests__/command-errors.test.ts`, which asserts the classification *and* the route's branch order, since the defect lived in the interaction between the two.

**One argument name per command.** `args` is `Record<string, unknown>` from the button to the Tesla request body, so a UI sending `{limitPct}` to a builder reading `args.percent` type-checks and fails at runtime. It did: `/charging` sent `limitPct`, `TESLA_COMMAND_MAP` read `percent ?? 80`, and **every live charge-limit change reached the car as 80%** behind a success toast. The mock engine also read `limitPct`, so the simulator and its unit test agreed with the UI and all three were wrong about the car. Standardised on `percent` (Tesla's own field name) across `charging-client`, `mock/engine`, `useVehicleCommand` and the tests, with `src/lib/brands/__tests__/command-args.test.ts` asserting that the Tesla body builder and the mock engine respond to the same key — neither alone can catch a rename.

**Shared: `ConfirmCommandDialog` + `SENSITIVE_COMMANDS`** (`src/components/vehicle/ConfirmCommandDialog.tsx`). The dialog was byte-identical in two components and the sensitive-command set existed in *three* places, the third being `security-alert.ts`, which exports `isSensitiveCommand()` but imports the Supabase admin client so no component can use it. A security-relevant list whose natural home is the server copy would have drifted with the UIs left behind.

**`src/lib/time.ts`** — `minutesFromMidnight` / `minutesToHhmm`. Three screens converted `<input type="time">` to Tesla's minutes-past-midnight independently, with three different malformed-value fallbacks. One turned a cleared input into `0`, silently scheduling charging for midnight; it returns `null` now and the Apply button is disabled.

**Not draining the battery.** Every poll of a linked car is a `vehicle_data`
call, and `fetchVehicleData` answers a 408 by sending `wake_up` — so an open tab
keeps the car awake, and a Tesla that never reaches deep sleep loses roughly ten
times more charge per idle day. Four things stop that:

1. TanStack does not run intervals while the tab is hidden, so a backgrounded
   phone or a buried tab polls nothing at all.
2. `useVehicle` stops polling after **10 idle minutes** (`IDLE_PAUSE_MS`) — for a
   focused tab nobody is touching, which is the case the browser cannot detect.
   A deliberate touch or keypress resumes it; a `visibilitychange` does not.
3. A failed poll stops the interval instead of retrying every 30 s: an
   unreachable car is asleep, out of signal or unlinked, and each retry would
   wake it. The error card's Retry is the way back.
4. Screens that need a value rather than a stream (the trip planner) pass
   `poll: false` and never start an interval.

A pause must also actually stop polling, and two things defeated it. `armIdleTimer()` ran unconditionally in an effect whose deps include `active`, so pressing "let it sleep" re-armed the countdown on an already-paused hook; ten minutes later it set `pausedByIdle`, and the next tap auto-resumed — the control survived exactly ten minutes and then silently started waking the car with the indicator back to green. And `refetchInterval` is scheduled **per observer, not per query**: `useVehicleNotifications`, `useSmartChargeNotifications` and `SmartChargeCard` each mounted their own `useVehicle` on the same key beside the pause button, so the dashboard kept polling regardless. Those three pass `poll: false` now — they read state, they are not pollers.

The `live` parameter that gates 2–3 **defaulted to `false`**, and only the
dashboard and the map passed it — `/commands`, `/charging`, `/insights` and the
energy cards each polled a real car every 30 s with no idle cut-off. It defaults
to `true` now: an opt-in protection that every call site has to remember is not
a protection. The dashboard additionally shows a manual "let it sleep" control
(`SleepControl`), and that pause is sticky — only idle pauses auto-resume.

**Where is my car.** The dashboard location row is tappable and opens
`/map?lat=…&lng=…&car=1`. That mode is framed for walking, not browsing:

- `FitCarAndWalker` fits the car and the walker together with padding, capped at
  zoom 17 — the default zoom 10 is tens of kilometres across, right for finding
  chargers and useless for finding a car. With no fix yet it drops to zoom 17 on
  the car alone. `CenterOnUser` and `FitStations` stand down so nothing fights it.
- Geolocation is requested with `enableHighAccuracy` and a 10 s timeout instead
  of the 3 s coarse fix used for browsing, and it does **not** re-centre — a
  network fix landing a second later would yank the map off the framing.
- A dashed green line joins the two. Deliberately straight and dashed: it is a
  bearing and a distance, not a route. A solid line would promise a footpath
  nothing computed.
- A banner shows the distance (`haversineMeters`, rounded to 10 m under a
  kilometre) and hands walking directions to the phone's maps app, which knows
  about crossings and one-way footpaths. A denied or failed fix says so rather
  than promising indefinitely that it is still looking.
- `fitBounds` padding is asymmetric (`175` top, `96` bottom): the banner and
  mode card cover the top ~160px, so uniform padding put the northern pin
  behind the banner announcing how far away it was. The locate button also
  stops re-centring in this mode — it flew to zoom 11 and `FitCarAndWalker`
  will not re-fit coordinates it has already handled, so there was no way back.

Reading the parameters into initial state rather than an effect means panning
away is not undone on re-render.

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

**Deduplication — four mechanisms, kept disjoint so they compose.** OCM is effectively the only source along the Greece → Bulgaria → Romania corridor, and its community submissions describe one site several ways. Clustering only ever matches an *incoming* record against stored ones — it never reconciles two stored rows with each other — so every runtime rule needs a SQL counterpart to clean up rows already saved.

| Pass | Runtime rule (`dedup.ts`) | SQL cleanup | Radius |
|---|---|---|---|
| Same operator | operator similarity ≥ 0.5 | `dedupe_chargers_batch` (034) | 40 m |
| Same bay, different names | hardware agreement overrides the name conflict | `dedupe_same_site_names` (038) | 15 m |
| Brand split across fields | one row's operator appears in the other's name/operator, plus hardware agreement | `dedupe_same_site_brand` (039) | 40 m |
| Coincident coordinates | force-merge | `021` grid pass | ~11 m |

The brand rule exists because sources disagree about *which field* holds the network: OCM had one Shell forecourt as `name: "SHELL Nea Kerdilia" / operator: "NRGincharge"` and `name: "nrg - Shell" / operator: "Shell ΠΑΡΑΣΚΕΥΟΠΟΥΛΟΣ"`. Operator-to-operator similarity reads ~0.09 there, so the pair looked like two networks. Guards: only tokens ≥5 chars count, generic words (`charging`, `station`, …) are stoplisted, the shared token must be somebody's declared **operator** (a shared place name is not a brand claim), and the hardware must agree — so a 350 kW Ionity bay on a Shell forecourt is never absorbed by the host's 60 kW one. Non-Latin operator names yield no tokens in either implementation and so can never merge on this rule.

**Server logging.** `src/lib/debug-log.ts` has two entry points. `logServer(level, scope, message, context)` writes one JSON line to the platform log and nothing else — use it on request paths, where a burst of errors would bury the pipeline events in the table. `recordDebugLog(...)` does both: the same line, plus a row in `debug_logs` for the panel to show. One line of JSON rather than a prettified object because Vercel's log viewer is a text search over raw output: `"scope":"ndw"`, `"level":"error"` and `"flux":true` each find exactly the matching events, where a multi-line object matches nothing. `errorContext(err)` narrows an unknown catch value to `{ name, detail, stack }` with the stack capped at four frames.

**Which one the Tesla paths use.** `recordDebugLog`, not `logServer` — `vehicles/commands`, `vehicles/state`, `vehicles/charging-history`, `tesla/callback` and `tesla/partner`. The panel is the only screen available on a trip, and a command failing is precisely what has to be readable there; logged with `logServer` they reached Vercel only, so "check /debug → Activity" pointed at a panel that could never show them. The original worry about burying ingest events no longer applies now that the panel collapses repeats and `prune_debug_logs` caps the table at 500.

**Roadmap (`src/lib/roadmap.ts`).** The short form of `docs/TODO.md`: the handful of things between here and paying customers, each with one next action. Rendered at the top of `/debug` under "Where we are". Every milestone that can be observed from the running deployment carries a `check` resolved against the debug config, so the list cannot quietly go stale; ones that cannot are marked "manual" (dashed circle) and are the ones to review by hand. Edit this file, not the panel.

**Debug panel sections.** Four groups, in the order they get used: **🚗 Car** (Tesla go-live checklist, granted scopes, Virtual Key pairing, Tesla/vehicle logs), **⚡ Chargers** (populate, dedupe/cache maintenance, source probe, charger logs and ingest runs), **📋 Progress** (roadmap milestones, migrations), **🔧 Tools** (configuration, API caller, OCR). A single flat list meant the area being debugged was always buried under whichever one was noisiest.

**Section reports.** Each of the first three has a **Report** button producing a handful of plain-text lines — setup counts, scopes, distinct log entries with age — instead of the ~900-line JSON, which buries its own findings and is mostly irrelevant to any given question. "Raw JSON" is still there, demoted, for when the shape of the data *is* the question. The signing keypair is excluded from both.

**Debug panel layout (`/debug`, admin-only).** Opens as a status screen, not a control board: a single "next step" line (bootstrap → unapplied migrations → first unmet Tesla prerequisite), then warnings, then the charger totals. Everything else is a collapsed `Panel` with a badge saying whether it needs attention, so the page is readable on a phone — Migrations, Go live with Tesla, Configuration, Populate chargers, Maintenance (dedupe + freshness cache), Check the sources (probe **and** raw upstream response, previously two sections), Call an API route, Activity (logged errors **and** ingest runs, previously two sections), Test OCR. "Copy all" carries every panel's last result, which is how findings get shared — with one deliberate exclusion, below.

**"Call an API route" panel** summarises a non-JSON response instead of dumping it: status, content-type, byte count and a 200-character tag-stripped excerpt. A wrong `/api/` path makes Next.js render the app's HTML 404 — ~200 KB of markup, scripts and the whole locale bundle — which buried the one useful fact (the status) and made the result impossible to paste anywhere. A 404 or 405 also gets a one-line hint. GET/POST toggle, because several routes worth poking at are POST-only.

**Activity panel.** Pulls 200 log rows rather than 50, collapses repeats (grouped by `level|scope|message` with a `×N` count), and **splits by area** — "Tesla & vehicle" first, then "Charger sources". A flat list is always dominated by whichever subsystem is noisiest, which is never the one being debugged; the Tesla group renders even when empty, because "nothing logged" answers the question when you are waiting for a command failure to show up. Each entry carries a relative age and anything past 24h is dimmed, since a two-day-old error reads as current when only an absolute timestamp is shown. Ages are computed against the payload's `generatedAt`, not `Date.now()` — pure, and they do not drift while the page sits open. Ingest runs are capped at 12.

**Configuration panel** reports only non-Tesla settings. The seven Tesla env vars live in "Go live with Tesla" instead, where they appear in dependency order with what each one blocks; listing them in both places made Configuration the longest thing on the page while saying less.

**Signing-keypair generator (`POST /api/internal/debug/tesla-keypair`).** Mints the EC P-256 pair Tesla requires and returns the private half as single-line base64 plus the public half as PEM. It exists because the halves go to two different hosts and neither is a shell — from a phone the alternative is finding a machine with `openssl`. Admin-only, rate limited to 5, `Cache-Control: no-store`, generated only on an explicit press, and **stored nowhere**: not in the database, not in a log (only the fact that one was minted), and explicitly kept out of "Copy all", which is meant to be pasted into a chat. Node's `sec1` encoding is what yields `BEGIN EC PRIVATE KEY`, which is both what Tesla expects and what the proxy entrypoint checks for. The panel warns when a car is already linked, because regenerating means redoing both halves: the new public key has to be deployed and confirmed served before pressing Register, or Tesla re-fetches the old one and re-registers it over itself.

**Call an API route** runs a GET against the app from the browser with the caller's own session — a request they could already make by typing the URL, so there is no server route and none of the SSRF surface a server-side fetcher would have. Restricted to `/api/` and GET so it stays a diagnostic.

**Running a cleanup:** the debug panel's dedupe button runs 034 + 038 + 039 in a loop until they stop finding duplicates (`POST /api/internal/debug/dedupe`). All three are idempotent.

**Migration 043 keeps provenance.** Deleting a duplicate used to cascade its `charger_sources` rows away, so the survivor never learned a second source had corroborated it and its confidence stayed lower than the evidence warranted — visible as chargers outnumbering source rows (6,300, then 1,160 after the first big dedupe). Each pass now re-points the duplicate's refs to the surviving row before deleting, and recomputes `source_count` from the table instead of trusting the value `upsert_chargers_batch` wrote from the payload. Verified on a fixture: 11 chargers → 8, source refs stay at 11, and the survivors' counts rise to match. Remaining gap: in a chain longer than the merge radius the chosen neighbour can itself be deleted in the same pass, and those refs still cascade; re-ingest recovers them.

**Migration 041 is required for any of them to finish.** Each pass carries an equality predicate — `operator_id` for 034, `round(max_power_kw)` for 038/039 — and the planner preferred a hash join on it over `chargers_geo_gix`, pushing `ST_DWithin` into the join filter. On 22k rows that measured 57 s / 36 s / 381 s, all past the statement timeout, surfacing as *"canceling statement due to statement timeout"*. Rewriting the correlated `EXISTS` as `CROSS JOIN LATERAL (… LIMIT 1)` makes the subquery non-flattenable, so the planner uses the nested loop and the spatial index; 039 additionally reads the brand tokens from `operator_brand` / `site_brand` generated columns instead of calling `charger_brand_tokens()` per pair. Same rows deleted, 381 s → 0.22 s. If you add a spatial dedupe pass, use the LATERAL shape — a correlated `EXISTS` next to an equality predicate will silently lose the index.

**Migration 042** indexes `charger_sources.charger_id`. Migration 017 indexed the `(source, source_ref)` uniqueness constraint but never the foreign key, and `charger_connectors` got its index while this table was missed — so every `ON DELETE CASCADE` sequentially scanned the table. Deleting a 2,000-row dedupe batch: **1,716 ms → 25 ms**.

**Apply migrations in id order.** Most of these files are `create or replace function`, so applying an older one afterwards silently overwrites a newer definition. This happened in the field: 041 rewrote four dedupe functions, 038 was applied eight seconds later, and its slow `dedupe_same_site_names` came back — the panel showed everything "applied" while the dedupe kept timing out. `POST /api/internal/debug/migrations` now returns **409** when a newer migration is already applied, listing which ones; pass `force: true` to override deliberately.

> The legacy live-aggregation routes `GET /api/charging-map` and `GET /api/charging-stations` were **deleted** — no callers remained after the bbox charger queries replaced them. See section 23.

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
- **Send to Tesla:** when the planned vehicle is a Tesla and the route is feasible, a button POSTs `share_navigation` with **all charging stops as waypoints** (full route in one call); `precondition_max` is automatically called at departure for any non-Supercharger DC stop. Tesla handles Supercharger preconditioning internally. A manual "Pornește precondiționare" button is always visible as a fallback. **Share route** hands the whole plan — origin, destination and every charging stop as waypoints — to the OS share sheet as a Google Maps directions link, so it can go to the Tesla app or any navigation app, and works with no Tesla linked; it falls back to copying the link where Web Share is unavailable, and fires preconditioning on the same terms as the Fleet API path. A one-time dismissable disclaimer explains the behavior difference between Supercharger and non-Tesla stops.
- **Saved routes:** users can save up to 10 planned routes (auto-named "Origine → Destinație", renameable). Entry points: bookmark button in the desktop sidebar, above the mobile search form, and in the mobile results-sheet handle — all open the same bottom sheet. Save button locks into a "saved ✓" state; only the chosen variant is persisted, with its polyline thinned to 400 points — a full-geometry 3-variant snapshot would exceed the 100 KB request cap on any real road trip. Snapshots are shape-validated on load (variants and their plans, not just the containers); an unreadable one clears the plan rather than leaving the previous route on screen. Delete uses an inline styled confirm (no `window.confirm`). Client state lives in `src/hooks/useSavedRoutes.ts` (TanStack Query). Stored in `saved_routes` table (Supabase, RLS + `user_id` index, migration 032+033). API: `GET/POST /api/saved-routes` (payload capped at 100KB, labels at 300 chars), `PATCH/DELETE /api/saved-routes/[id]`.

- **One route per origin/destination pair (migration 040).** The "saved ✓" lock was the only guard and it is set *after* the POST resolves, so two taps inside the round-trip both saved; a retry, a second tab, or re-saving a loaded route defeated it entirely. `saved_routes.route_key` is now a **generated** column — `md5` of the origin and destination rounded to 4 decimals (~11 m, so re-geocoding the same place lands on the same key) — with a unique index on `(user_id, route_key)`. `POST` upserts on it: re-saving a trip **refreshes** the stored plan and returns 200, a new route returns 201. Only a new key counts against the 10-route cap, so a driver holding ten can still refresh. The key is computed by `public.saved_route_key(...)`, called as an RPC by the API and used by the generated column, so the two definitions cannot drift. Applying 040 also deletes any duplicates already stored, keeping the most recent of each group. Client-side, a `useRef` guard closes the double-tap window synchronously (React state cannot) and all four save buttons now disable and spin while in flight.

**Corridor stations:** `fetchCorridorStations` sources stops from the PostGIS platform (per-segment bbox sampling) with an OCM fallback for non-bulk countries and a final Overpass fallback. `TripMap` also draws every charger *on the way* alongside the numbered stops — filtered to within 5 km of the driven line (the underlying query is by bounding box, which on a long trip is mostly nowhere near the road), power-tier coloured, and tapped for name and kW. **Long-pressing the map** (Leaflet `contextmenu`, so a touch long-press or a desktop right-click) loads chargers for a ~25 km box around that point and merges them in — requested areas are exempt from the corridor filter, since asking for somewhere off-route is the point. The request also warms the area server-side, because the read path ingests a cold bbox from every source before answering. A pulsing ring marks which area is loading.

**Address search (geocoding):** `GET /api/geocode?q=&lat=&lng=&cc=` proxies Nominatim → Photon (fuzzy fallback) with optional bias point + country filter; quota 600 req/h/user (debounced typeahead). Reverse geocoding (`/reverse`) powers "Use my location". Network errors surface a localized message instead of raw `Failed to fetch`.

**UX:** map-first compressed form (origin/destination first; SOC + vehicle behind an "Options"/"Advanced" disclosure); recent destinations (`localStorage`, LIFO ×5); user-configurable petrol comparison (`localStorage["flux_fuel_comparison"]`); collapsible results panel; full keyboard nav + combobox ARIA on `GeocodingSearch`; desktop sidebar (lg+) with `StatStrip` results. `ModelSpec.supportedConnectors` is `["ccs2","tesla"]` for all Tesla models.

**How to use:** UI `/map?mode=plan`. API: `POST /api/trip-plan` (vehicle/origin/SOC/destination/`arrivalSocPct` → `planTripVariants`; `maxDuration = 30`), `GET /api/geocode`.

**Key files:** `src/app/api/trip-plan/route.ts`, `src/lib/external/routing/{planner,corridor-stations,charge-curve,reliability,types}.ts`, `src/lib/external/routing/providers/{osrm-router,ors-router,tomtom-router}.ts`, `src/app/api/geocode/route.ts`, `src/components/trip/{GeocodingSearch,TripMap,StopCard,CostSummary,StationDetailSheet,ReliabilityBadge}.tsx`, `src/app/(dashboard)/map/map-client.tsx`, `src/lib/{fuel-comparison,brands/models}.ts`.

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

**One answer to "is this user pro".** `getSubscriptionTier(userId)` is it: the stored `profiles.subscription_tier`, or `pro` when the account's email is in `ADMIN_EMAILS` — the maintainer needs a mock vehicle to develop against plus a real linked car, and paying themselves through Stripe for the second slot is silly. Reuses the allowlist that already gates the debug surface rather than adding a second notion of "the owner".

`GET /api/me/capabilities` read the column directly and so disagreed with it: the same account was pro for the vehicle cap and free for every capability the UI renders from — Settings' plan row, the free-slot check, the document limit, the add-vehicle modal. It now calls the function. If you add a third caller, call the function too.

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

**Status:** Ships dark behind `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`. When unset/false the settings card is hidden, notification API routes return 404, and the cron no-ops. The rain+windows alert now works on live cars too — `mapVehicleData` reads `fd_window`/`fp_window`/`rd_window`/`rp_window` (it returned `windowsOpen = null` regardless of what Tesla sent), so the alert is no longer mock-only. It still needs all four reported: a half-asleep car yields `null` and the alert holds rather than guessing.

**How to use:** Settings → *Notificări* card (toggle channels + alert types; Test button sends an instant push). Ops: set `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=true`, `CRON_SECRET`, VAPID keys, `RESEND_API_KEY`, Twilio creds. Cron `POST /api/cron/poll-vehicles` runs `0 6 * * *` (daily; `vercel.json` is the truth — this said `*/15` for a long time and was simply wrong) with `Authorization: Bearer <CRON_SECRET>`. Push management: `POST /api/push/subscribe`, `POST /api/push/test`, `GET /api/push/vapid-public-key`. Prefs: `GET/PATCH /api/me/notification-preferences`.

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

**Page titles too:** a route's `metadata.title` is a visible string. Use `export async function generateMetadata()` with `getTranslations`, not a hardcoded literal — `/map` shipped a Romanian-only `"Hartă · Flux"` title that every locale saw in the browser tab. Covered by `e2e/i18n.spec.ts`.

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

- **Tesla Fleet API (dormant):** `GET /api/tesla/connect`, `GET /api/tesla/callback`, `POST /api/tesla/refresh` — all return **410** unless `isLiveEnabled("tesla")`. `GET /api/tesla-public-key` serves the command-signing public key (proxied to `/.well-known/appspecific/com.tesla.3p.public-key.pem` via `next.config.ts` rewrites). Tesla token refresh is single-flighted per vehicle (`src/lib/tesla/tokens.ts`).
- **`apiFetch` error messages:** HTTP/2 carries no reason phrase, so `res.statusText` is `""` for everything Vercel serves. The fallback chain used `??`, which skips only null/undefined — the empty string won, and any error without a JSON body (a 504 from an exceeded `maxDuration`, above all) reached the UI as an empty message. Callers written `msg || t("some_hint")` then rendered their hint as if it were a diagnosis: a planner timeout surfaced as "try a higher battery percentage". Now `||`, with the status appended (`"Request failed (504)"`). Pinned by `src/lib/__tests__/api-fetch.test.ts`.
- **Typed API client layer (`src/lib/api/`):** all client HTTP calls go through one typed module per resource (`vehicles`, `chargers`, `documents`, `me`, `tariffs`, `costs`, `trip`); `apiFetch` (`src/lib/api-fetch.ts`) is imported only here. `apiFetch` redirects to `/login` on client 401.
- **Rate limiting:** `checkRateLimit(userId, bucket, max)` in `src/lib/rate-limit.ts` (Upstash Redis).
- **Waking the car is opt-in, and it is one endpoint.** `vehicle_data` answers **408** while a Tesla is asleep, and `fetchVehicleData` used to respond by POSTing `wake_up` and retrying. That made *every read a wake*: opening any screen pulled a parked car out of deep sleep, however carefully the client avoided polling — reducing the interval could never have fixed it, because the interval was never the mechanism. `allowWake` now defaults to **false** and only `POST /api/vehicles/[vehicleId]/wake` passes true (auth + ownership, 10/hour, counted). A background read of a sleeping car throws `TeslaAsleepError`; the state route answers it with the last stored reading, `isOnline: false` and `lastSeenAt` so the age is visible. Pinned by `src/lib/tesla/__tests__/no-background-wake.test.ts`.
- **Live readings are stored** (`src/lib/tesla/last-known.ts`, throttled to one per five minutes per vehicle) in `vehicle_snapshots`. Before this the live path persisted nothing, which is *why* a read of a sleeping car had to wake it — there was no other answer to give. It also gives linked cars the history `/insights` was computing from a table only the simulator wrote to.
- **`GET /api/internal/debug/tesla-calls`** (admin) returns hourly counts of what actually reached Tesla — reads, wakes, commands — for the last 24 h, from `src/lib/tesla/call-log.ts` (Redis, 48 h TTL). Rendered by the **Somnul mașinii** panel, first in `/debug`. This exists because "the app does not keep the car awake" is not a claim code can credibly make about itself: every client-side guard is an assertion, and this is a measurement taken at the last point before the request leaves. `wake` is the number to read — it should be zero on a day nobody pressed the button.
- **`flux:letItSleep`** (`src/lib/vehicle-sleep.ts`) is one persisted, app-wide switch, read through `useSyncExternalStore` and synced across tabs. It replaces the per-hook pause, which lived in `useVehicle`'s own React state and so covered exactly one mounted hook and died on the next navigation — a control that looked like a promise and was not one. When on, `useVehicle` sets `enabled: false`, so it stops the fetch itself rather than just the interval.
- **`GET /api/vehicles/[vehicleId]/charging-history`** returns the stored sessions for one car. Added because `/charging` had no way to ask per car: the page fetched history for the FIRST vehicle by `created_at` while the client rendered live state for the SELECTED one, so with two cars linked the list belonged to a different car than the battery above it. Auth + ownership checked before the query — `charging_sessions` carries no `user_id` of its own. Read through `useChargingHistory(vehicleId)`.
- **Debug badges count what their panel contains.** One number — every error row in `debug_logs` — was rendered as both *"44 errors logged"* on **Check the sources**, a panel that displayed no logs at all, and *"44 failed runs"* on **Charger activity**, where every recent run had status `ok`. So the panel announced 44 problems and offered no way to read one, and the number it announced was not measuring either thing it named. Logs are grouped three ways now (Tesla / charger connectors / everything else), the connector group renders inside the panel whose badge counts it, that badge distinguishes today from older, and failed runs come from `recentRuns`. Stale matters here: all 44 were four days old, from connectors that have since recovered.
- **Log context is readable on a phone.** Entries dumped `JSON.stringify(context)` on one line, which for a Tesla error is a serialised stack of minified webpack chunk paths with the one useful sentence buried inside it. `detail` is shown as prose, the remaining fields as `key=value`, and the stack sits behind a tap — it has never once helped, the frames being minified.
- **The to-do list lives in the panel, grouped by gate.** `/debug` → *Where we are* renders `src/lib/roadmap.ts`: gate 1 *before a second car is linked*, gate 2 *before anyone pays*, gate 3 *what differentiates the product*, each with a per-gate "N left" count. Items that can be checked against the running deployment are; the rest report as manual. Every item that is not merely a task carries a `cost` — what breaks if it is skipped — because on a flat list "add the Stripe keys" and "the signing proxy is an open relay" looked like peers. **Copy progress report** carries the gates and the costs too, so the list survives being pasted into a message. Long form: `docs/NEXT-STEPS.md`.
- **RLS state is inspectable from the panel** (`/debug` → Migrations → Row-level security). `GET /api/internal/debug/rls` lists every table in `public`, which lack RLS, their owner, whether an extension owns them, and — the part the advisor's wording hides — whether `anon`/`authenticated` hold write privileges, shown in red. `POST` runs the sweep. It exists because the alternative was pasting SQL into Supabase's editor, which is not something you can do from a phone, and this app is operated from one. Backed by migration `048`, whose three functions return rows precisely because `exec_sql` returns void and a `DO` block's `NOTICE` output would never reach the panel.
- **The migration registry is generated.** `npm run migrations:registry` rewrites `src/lib/migrations/registry.ts` from `supabase/migrations/*.sql`, excluding `001`–`033` (applied by hand, before the runner) and `037` (which creates the runner). The SQL stays inlined rather than read at runtime — only imported files are bundled, so a filesystem read works locally and returns nothing in production — but the file was maintained by hand and had stopped at `044`, leaving `045`–`048` in the repo and unrunnable from `/debug`, which is the only place they were going to be run from. Run it after adding a migration and commit the result.
- **Function EXECUTE is revoked from `anon`/`authenticated`** (migration `047`). Migration 031 enabled RLS on the charger tables and it did not help: ~20 `SECURITY DEFINER` functions across 018–044 run as their owner, and PostgREST exposes every function the caller holds EXECUTE on at `/rest/v1/rpc/<name>`. EXECUTE defaults to PUBLIC, so the browser-shipped anon key reached `chargers_in_bbox`, `upsert_charger`, `upsert_chargers_batch` and the dedupe family with RLS not consulted — two of which mutate data. Revoked schema-wide rather than by listing twenty signatures, plus `alter default privileges` so the next function does not reopen it. Safe because no application code uses those roles: every access goes through a route holding the service-role key, `src/lib/supabase/client.ts` is imported by nothing, and no client component calls `.rpc()`. A function you *want* browser-callable now needs an explicit grant — which is the point.
- **Push subscriptions are owned** (migration `045`). `endpoint` was globally unique and the upsert conflicted on it alone, so posting someone else's endpoint rewrote that row's `user_id`: the victim lost their subscription and the attacker's notifications were delivered to the victim's browser. The conflict target is `(user_id, endpoint)` now, so a foreign endpoint can only ever create a row of your own.
- **Deleted as dead code** (each verified unreferenced first): `POST /api/tesla/command` and `GET /api/tesla/vehicle` — authenticated endpoints that spent Fleet API quota and drove a real car with weaker handling than the route actually in use (no `buildBody` mapping, no `recordCommandEvent`, no security alert, no 409 reauth); `GET /api/charging-map` and `GET /api/charging-stations`, superseded by the bbox charger queries; `src/lib/currency/convert.ts`, `src/hooks/useVirtualKeyPair.ts`, and `src/components/vehicles/VehicleIcon.tsx`. The last also removes `src/components/vehicles/` — two directories one letter apart from `src/components/vehicle/` is a trap, and the singular one is where every live component lives.

---


### Linking, re-authorising, and OAuth errors

**What:** `GET /api/tesla/connect` starts the PKCE flow; `GET /api/tesla/callback`
finds the car's region, upserts the `vehicles` row (matched on `tesla_vehicle_id`,
so linking twice never creates a duplicate) and **upserts** `tesla_tokens` on
`vehicle_id` — that table has a unique index there, so re-linking an existing car
would otherwise fail on the last step and throw the fresh tokens away.

**Re-authorising:** revoking Flux in the Tesla account makes token refresh fail;
`getValidAccessToken` raises `TeslaAuthError`, `/api/vehicles/[id]/state` answers
**409 `TESLA_REAUTH_REQUIRED`** (not 401 — `apiFetch` logs the user out of Flux on
401), and the dashboard swaps its error card for "reconnect". That link carries
`?reauth=1`, which is what lets `/connect/tesla` skip its "you already have a
vehicle → /dashboard" guard; the same exemption applies to `?error=`, so callback
failures are now visible instead of being redirected away. With `reauth` set the
page shows its own title/description/CTA rather than the onboarding copy.

**Error copy:** each of the seven callback failures (`missing_params`,
`state_mismatch`, `token_exchange`, `fleet_api_rejected`, `no_vehicles`,
`vehicle_save`, `token_save`) has an `onboarding.connectTesla.err_<code>` string in
all five locales; unknown codes fall back to the generic `error` message.

**Key files:** `src/app/api/tesla/{connect,callback}/route.ts`,
`src/app/connect/tesla/page.tsx`, `src/components/onboarding/ConnectTeslaStep.tsx`,
`src/lib/tesla/{auth,tokens}.ts`, `src/app/(dashboard)/dashboard/dashboard-client.tsx`.

**Dependencies:** Tesla Fleet API, Supabase, `LIVE_INTEGRATIONS=tesla`.

### Scopes and what a linked car actually reports

**What:** `TESLA_SCOPES` requests every scope the Fleet API offers — `openid`,
`offline_access`, `user_data`, `vehicle_device_data`, **`vehicle_location`**,
`vehicle_cmds`, `vehicle_charging_cmds`, `energy_device_data`, `energy_cmds`.
`TESLA_PARTNER_SCOPES` stays at the original four for the `client_credentials`
partner token (see `docs/VEHICLE-CONNECTION.md` for why they differ).

**Location needs both halves:** the `vehicle_location` scope *and* `location_data`
in the `vehicle_data?endpoints=` list. Tesla split location out of
`vehicle_device_data` in Nov 2024; firmware 2023.38+ omits position unless the
endpoint is named. Missing either, the car answers normally with null coordinates.

**Grants can be narrower than the request.** Tesla's consent screen is a tickbox
per permission, so the granted set is read from the token response and stored on
`tesla_tokens.scopes` (it used to be a hardcoded list that did not even match the
request). The refresh call sends no `scope` at all — OAuth forbids widening a
grant on refresh, so pinning the full list would reject every refresh for a
partial grant. `/debug` → "Go live with Tesla" shows granted vs missing per car
and warns when `vehicle_location` is absent.

**`mapVehicleData` now maps what it receives.** Doors, windows, frunk/boot, tyre
pressures, speed, shift-derived motion state, pending software update, dashcam,
passenger temp, seat/steering heating — all previously hardcoded `null` while
Tesla was sending them. Three conversions are pinned by tests: `tpms_pressure_*`
is **bar** (×100 → kPa), `drive_state.speed` is **mph**, and openings are
**numbers where 0 is closed**, not booleans. Partial reports map to `null` rather
than a confident "closed" — a half-asleep car naming two of four doors says
nothing about the other two.

**Key files:** `src/lib/tesla/constants.ts`, `src/lib/tesla/api.ts`,
`src/types/tesla.ts`, `src/lib/tesla/__tests__/map-vehicle-data.test.ts`.

**Tesla account safety:** linking grants the full scope set, so a linked account
exposes live location and profile details plus
unlock, climate, charge port and remote start. Tokens are encrypted at rest
(AES-256-GCM). Three controls sit on top: `DELETE /api/tesla/connection` revokes
each refresh token at Tesla and deletes the stored rows (Settings → Advanced →
Tesla; vehicles fall back to the simulator, trips/costs/documents are kept);
`GET /api/vehicles/[id]/command-history` surfaces the `command_events` audit
under the controls on `/commands`; and `unlock` / `remote_start` ask for
confirmation before firing, then notify the owner on success via
`alertOnSensitiveCommand` (`src/lib/notifications/security-alert.ts`).

### Partner key diagnostics (what Tesla holds vs what we serve)

**What:** four different values are all called "the public key", and only their
disagreement explains why a *signed* command comes back `your public key has not
been paired with the vehicle`:

1. `TESLA_PUBLIC_KEY` — the variable.
2. What `https://<domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`
   actually answers. **This is the only one Tesla reads.**
3. What the signing proxy holds (`GET {TESLA_PROXY_BASE_URL}/proxy-public-key`,
   derived at container boot from the private key in hand).
4. What Tesla stored for the domain (`GET /api/1/partner_accounts/public_key`).

A command can only succeed when all four are identical. (3) mattering at all is
the trap: a proxy running the wrong private key returns the *same* message as a
genuinely unpaired car, so the owner is sent to re-pair a car that was already
paired correctly.

**How to use:** `/debug` → Car → **Check status** renders the four side by side,
first 8 hex chars each, red where they differ from the domain, with a one-line
`verdict` naming the one to fix. The env-var-only reading it replaced *assumed*
what the domain served rather than fetching it, which made a broken route and a
stale Tesla record indistinguishable. Raw JSON is behind a `<details>`; **Copy
car report** prints all four on two lines. When the proxy is the odd one out the
panel also offers its PEM to copy (both raw and `\n`-escaped one-line, since
Vercel's editor takes one line) — adopting the proxy's key is the exit that
needs no private key you may no longer hold. A `warning` field flags
`env ≠ domain` separately: harmless today, but the next deploy that picks the
variable up republishes a different key and unpairs the car.

**Is the car actually paired:** `/debug` → Car → **Check pairing** calls
`POST /api/1/vehicles/fleet_status` per live VIN with that car's own token, and
reports Tesla's `key_paired_vins` / `unpaired_vins` verdict plus
`vehicle_command_protocol_required` and firmware. Every other pairing signal in
the app is inference — `virtual_key_paired` is only set *after* a signed command
succeeds — so this is the sole authoritative answer, and three-valued (a VIN in
neither list is `unknown`, not "unpaired").

**Where the published key comes from:** `TESLA_PUBLIC_KEY` →
`src/app/api/tesla-public-key/route.ts`, reached by a rewrite in
`next.config.ts`. Never add a route at the `.well-known` path itself — the
rewrite wins *and* `.gitignore`'s `*.pem` matches the directory name, so the
file is shadowed and untracked at once. That combination hid the real bug for
weeks: the rewrite served a PEM hardcoded in source since June while every
rotation went into the variable and changed nothing. `cache-control` is now
`no-store` (was `max-age=3600`, which could serve a rotated-away key for an hour).

**Show published key** (`/debug` → Car) fetches the URL three ways — as Tesla
does, with a cache-busting query, and the route directly — and prints the PEM
text with `x-vercel-cache`/`age`. A phone cannot open an
`application/x-pem-file` download, so this was otherwise unverifiable on the
device the app is tested from.

**Key files:** `src/app/api/internal/debug/tesla-partner/route.ts`,
`src/app/api/internal/debug/tesla-fleet-status/route.ts`,
`src/app/.well-known/appspecific/com.tesla.3p.public-key.pem/route.ts`,
`src/app/(dashboard)/debug/debug-client.tsx`, `tesla-proxy/Dockerfile`
(`/proxy-public-key`).

**Dependencies:** `/proxy-public-key` needs the current `tesla-proxy` image — an
older container answers 404 and the proxy row reads `none`.

### Email as identity (verification)

**What:** `/api/documents/recover` hands over unmatched inbound documents whose
`sender_email` matches the caller. That treated an email address as proof of
identity while nothing proved it: `/api/auth/register` creates every account
with `email_confirm: true` and sends no verification mail, because login goes
through `signInWithPassword` and Supabase refuses an unconfirmed address.
Register a stranger's address — nothing prevented it, and the address being
unregistered is exactly *why* their document went unmatched — and their
documents were claimable, PII and all. Gating on `auth.users.email_confirmed_at`
would have read as a fix and changed nothing, since registration always sets it.

**An `ADMIN_EMAILS` address counts as verified.** Not a loophole: that list is
an environment variable, so being on it means whoever controls the deployment
vouched for the address — stronger evidence than a click in an inbox, since
anyone who can edit it already owns everything the gate protects. It also keeps
the gate honest: without it a solo deployment cannot claim its own documents
until Resend is configured, and a fail-closed gate nobody can pass is a gate
someone eventually turns off.

**How to use:** `POST /api/account/verify-email` mails a signed link (Resend);
`GET /api/account/verify-email?token=…` records `profiles.email_verified_at` and
redirects to `/settings?email_verified=1|0`. `recover` returns **403
`EMAIL_NOT_VERIFIED`** until that column is set. The token is a stateless
HMAC over `userId:email:expiry` keyed on `NEXTAUTH_SECRET` (the same key the
OAuth state binding uses), valid 24 h. The address is inside the signed payload,
so a token issued for an old address cannot verify a new one, and the confirm
route re-checks it still matches the account. Deliberately not session-gated —
mail is opened on other devices — which is safe precisely because it can only
ever mark the one address it was issued for.

**Inbound attribution is down to one signal.** `resolveVehicle` used to fall
back to the `+subaddress` read as a user's email local part, and then to the
`From` header. Nothing in the handler verifies DKIM or SPF, so both were free
text: one email addressed `…+alice@` filed an attacker's document against
Alice's car and ran OCR on it under her account. Both are deleted, along with
the `listUsers({perPage: 1000})` helpers that scanned every user on each inbound
mail. What remains is the vehicle UUID in the subaddress — a capability, not an
identity. Unmatched mail lands in the fallback pool as `needs_review` with no
OCR. (The address is still derived from the primary key and therefore not
rotatable — **F3**, an open owner decision.)

**Key files:** `src/lib/email-verification.ts`,
`src/app/api/account/verify-email/route.ts`, `src/app/api/documents/recover/route.ts`,
`src/app/api/documents/inbound-email/route.ts`, migration `046`.
Pinned by `src/lib/__tests__/email-verification.test.ts`.

### Two features that had never worked once

**The vault calendar export.** `GET /api/vehicles/[id]/vault/calendar` selected
`name` and `plate_number` from `vehicles`. Neither column has ever existed —
it is `display_name`, and the plate lives on `vehicle_doc_meta` — so PostgREST
answered with an error and no rows, and the route returned **404
unconditionally** for its whole life. Fixed, and with it two iCalendar defects
that would have surfaced the moment it did work: `DTEND` for an all-day event is
*exclusive* (RFC 5545 §3.6.1), so start and end on the same date is a
zero-length event that Google and Apple each render differently; and
`toIcalDate` is now sliced to ten characters, because `valid_until` is
AI-extracted and a full timestamp turned into `20270430T00:00:00Z` — colons are
iCalendar's separator, so one such value corrupts the file for the importer.

**No vehicle document could ever reach `done`.** `averageConfidence` averages
every numeric confidence, and the parser padded the three fields a car document
has no equivalent for — kWh, billing period, session timestamp — with hardcoded
zeros. A flawless extraction therefore scored `(1+0+1+0+0+1)/6 = 0.5` against a
0.7 threshold and was filed `needs_review`. Those fields are now absent rather
than zero, and `averageConfidence` skips what was never reported. The two bugs
compounded: the calendar reads only documents that are `done`, so even a working
query would have exported an empty file. Pinned by
`src/lib/costs/__tests__/confidence.test.ts`, which keeps the old padded shape
as a case so it cannot come back quietly.

### Free-tier limits are enforced again

`canUploadDocument` and `canUploadVaultDocument` were `return { allowed: true }`
behind a `TODO(live): re-enable before launch`, so free-tier OCR was unmetered
and the Anthropic bill had no ceiling. Restored at 5 energy documents and 10
vehicle documents per month, counted separately because the two are used at
completely different rates. Pending and unclassified uploads count — they cost
the same OCR call, and excluding them is an unlimited quota for anyone who
uploads faster than the classifier runs. `CAR_DOC_TYPES` moved to
`src/lib/documents/car-doc-types.ts`: it decided three different things from
three hand-written copies, and the one in `subscription.ts` had gone stale at
six entries against the others' nineteen — restoring the limits against it would
have billed thirteen vehicle-document types to the energy quota.

## 24. Security hardening

- **Auth on every route** + Supabase UUID-scoped queries (`.eq("user_id", …)`); write routes resolve `ensureSupabaseUserId`.
- **Webhook secrets** via `x-webhook-secret` header only (inbound-email, internal warm/ingest-stats); fail closed (503) when unconfigured.
- **CSP:** `src/proxy.ts` (Next.js 16 Proxy convention) emits a per-request nonce CSP — `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'unsafe-inline'` (framer-motion), `connect-src 'self' {SUPABASE_URL}`, `frame-ancestors 'none'`, `object-src 'none'`, etc. The nonce is published on the `x-nonce` request header and threaded `src/app/layout.tsx` → `Providers` → `ThemeProvider`; any component injecting an inline script must receive it or `strict-dynamic` blocks it.
- **`x-pathname` request header:** also set in `src/proxy.ts`, because server components cannot read the current path. The `(dashboard)` layout uses it to build `?callbackUrl=` when bouncing an anonymous visitor to `/login`.
- **IDOR fix:** `GET /api/documents` filters by `user_id` in addition to vehicle ownership.
- **Rate limits** on Tesla vehicle route (60/window) and all `chargers` query routes.
- **Charger tables** are shared reference data — the documented exception to the per-user RLS rule.

> Known follow-up: `state`, `charging-history`, `weather`, `battery-health`, `commands`, `trip-plan` filter on `session.user.id` directly. Not broken in practice — the JWT callback bakes the Supabase UUID at sign-in; extending `ensureSupabaseUserId` to the 30 s-polled `state` route would add an admin round-trip on the hottest endpoint.

---

## 25. Testing

- **Unit:** charger pipeline (`src/lib/chargers/__tests__/`: normalize, ingest, dedup, confidence, query), charge curve, mock engine, trip share/snapshot/precondition helpers. Run: `npx vitest run` (226 tests).
- **E2E (Playwright):** `playwright.config.ts` + `e2e/` (smoke, auth, garage, costs, trip, authed-flow). CI `e2e-smoke` runs `smoke.spec.ts` (no credentials); authenticated specs gated on `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`. Run: `npm run test:e2e` (`npx playwright install --with-deps chromium` once).
- **Two projects:** `chromium` (Desktop Chrome) and `mobile` (Pixel 7). The mobile project is scoped to `public-pages.spec.ts` — only the a11y/layout specs need a narrow viewport.
- **Offline-capable specs** (no credentials, no network): `public-pages`, `auth`, `i18n`, `trip-planner`. 101 assertions covering console errors, hydration mismatches, accessible names, nested interactives, WCAG 2.5.8 tap targets, all five locales, and planner auth gating.
- **Helpers:** `e2e/helpers/a11y.ts` (`visibleControls`, `targetSizeViolations`, `unnamedControls`, `nestedInteractives`), `e2e/helpers/diagnostics.ts` (`collectDiagnostics`, `gotoSettled`), `e2e/helpers/auth.ts`.
- **`test.fail()` convention:** open UI bugs get a spec marked `test.fail()`, so the suite stays green while the bug is open and turns red the moment it is fixed — that is the signal to drop the marker and keep the spec as a regression test. Currently open: the 44×44 AAA touch-target gap (`mobile tap targets`); the 24×24 AA floor is enforced for real.
- **Sandbox escape hatch:** `PLAYWRIGHT_CHROMIUM_PATH` overrides the browser binary when the image ships a Chromium that does not match the managed download; `PLAYWRIGHT_BASE_URL` skips the managed `webServer`. Note `reuseExistingServer` is on outside CI — a server left running against a stale `.next` will produce phantom missing-chunk failures.

---

## 26. v2 redesign (`/v2`)

**What:** the Instrument redesign, running **beside** the shipping app instead of
replacing it. Same auth, same `VehicleProvider`, same hooks, same API routes —
only the presentation is new. Nothing under `/v2` can break `/dashboard`, and
the two can be opened on the same phone and compared screen by screen.

**How to use it:** open `/v2`. It lists every screen and whether it exists yet
(read from `V2_SCREENS`, so the list cannot claim more than has been built) and
links back to the current app for comparison. Individual screens live at
`/v2/<screen>`.

**The direction, in one paragraph:** one instrument (a 270° arc) where a number
IS a level; everything else is a 56px full-width row on an 8% hairline. No card,
no shadow, no rounded panel anywhere. Two faces (Space Grotesk, Geist Mono),
four type sizes. Every row carries its own state on the right, so nothing has to
be opened to learn whether it is on, and a disabled row prints the reason beside
it rather than being silently grey.

**Responsive rules** (drawn in the canvas, implemented as CSS custom properties):

| Never flexes | Flexes |
| --- | --- |
| row height 56px, tap targets 44px | `--v2-gutter: clamp(16px, 6vw, 28px)` |
| the 1px hairline | `--v2-arc: min(72vw, 300px)` |
| the four type sizes | `--v2-hero: clamp(64px, 21vw, 92px)` |

`dvh`, never `vh` (Safari's toolbar makes `vh` lie); the nav pads
`env(safe-area-inset-bottom) + 14px`. Extra height on a tall phone goes to the
gap **above** the action rows, never into the arc, so the actions stay in the
thumb's reach instead of drifting up with the screen.

**Theming:** `.v2` in `globals.css` redefines the *same* token names the rest of
the app uses (`--background`, `--primary`, `--border`, …), so every existing
Tailwind utility renders in the Instrument palette inside that subtree with no
second vocabulary. It is dark-only on purpose: a light version of a hairline
over near-black is a different design, not a tint.

**Polling:** `pollInterval()` in `src/hooks/useVehicle.ts` is the whole rule, in
one pure function pinned by `src/hooks/__tests__/poll-interval.test.ts`. Only
the dashboard polls; the charging screens poll **only while a session is
running** (a charging car is awake anyway); everything else reads the value
once and stays current through the invalidation `useVehicleCommand` already
does. `poll` accepts a predicate over the last reported state so a screen can
depend on the car's condition without needing the data to decide whether to
fetch the data. A poll on a sleeping Tesla wakes it, and a car kept out of deep
sleep loses roughly ten times more charge per idle day — this is a battery bill,
not a preference.

**The nav is `fixed`,** not the last child of a flex column, and `Screen`
reserves `--v2-nav-h` at the bottom so nothing lands underneath it. As a flex
child it only reached the bottom of the screen when the content above happened
to fill the viewport.

**Motion:** `.v2-sweep` (arc, 1.1s) and `.v2-rise` are arrive-once and are
removed under `prefers-reduced-motion`. Press feedback (80ms to 5% white) and
the pending counter are **not** animations and are never removed — a command
that takes eight seconds must still say so.

**Screens:** `/v2/dashboard`, `/v2/commands`, `/v2/map` (find my car),
`/v2/trip`, `/v2/chargers`, `/v2/charging`, `/v2/costs`, `/v2/garage`,
`/v2/documents`, `/v2/insights`, `/v2/energy`, `/v2/settings`, `/v2/more`, plus
`/v2/login` and `/v2/register`. Four jobs are deliberately still v1's: reviewing
a parsed document, account deletion, notification channels, and the charging-map
view. Those rows are labelled `v1` so the boundary is visible rather than a dead
end.

**No auth guard in `src/app/v2/layout.tsx`** — every page under it calls
`auth()` itself. A shared guard would need an exception carved out for
`/v2/login` and `/v2/register`, and a conditional guard is one refactor away
from guarding nothing. `LoginForm` is reused unchanged (it owns the
`callbackUrl` open-redirect check) with one added `defaultCallbackUrl` prop,
validated by the same rule as the query parameter.

**Key files:** `src/app/v2/layout.tsx` (auth + Space Grotesk + `.v2` scope),
`src/app/v2/page.tsx` (index), `src/app/v2/screens.ts` (the checklist),
`src/app/v2/*/`, `src/components/v2/instrument.tsx` (all primitives:
`Screen`, `Bleed`, `ScreenHeader`, `Row`, `Rows`, `Arc`, `ArcMini`, `HeroValue`,
`Bars`, `ValueTable`, `ChipRow`, `StepperRow`, `TimeRow`, `Mono`,
`SectionLabel`), `src/components/v2/nav.tsx`,
the `.v2` block in `src/app/globals.css`, the `v2` i18n namespace in all five
locales, and `design/` (the canvas the direction was designed in).

**Dependencies:** `next/font/google` (Space Grotesk), next-intl, TanStack Query
via the existing hooks. No new runtime dependency.

**Progress and defects found while porting:** `docs/REDESIGN-V2.md`.
