# ARCHITECTURE — Flux

> Source of truth: the code. This document explains the *why* behind key decisions. For system configuration see `docs/SYSTEMS.md`. For Cost Intelligence internals see `docs/COST-INTELLIGENCE.md`.

## Engineering standards

This codebase demonstrates the patterns DAO Lab applies in every client project:

- **Strict TypeScript** — no `any`, no `@ts-ignore`. Boundaries (API in / API out) are typed end-to-end.
- **Centralized API layer** — all internal HTTP calls go through one `apiFetch` helper. All external Tesla calls go through `src/lib/tesla/`. Components never know URLs or transport details.
- **Schema validation at boundaries** — every API route validates its input with Zod before reaching business logic.
- **Encrypted sensitive data at rest** — OAuth tokens are encrypted with AES-256-GCM before being written to Supabase. The DB never sees plaintext.
- **Row-Level Security by default** — every Supabase table has an RLS policy. The anon key cannot read another user's data even with a leaked SQL injection.
- **Server-only secrets** — the browser never sees Tesla tokens, the Supabase service-role key, or any client secret. Everything is brokered through `/api/*` routes.

## Why Next.js (App Router)

- **React Server Components** for the initial page load — the dashboard ships zero JS for layout chrome, and the auth-protected pages hydrate the vehicle data only on the client.
- **Route handlers** in the same project — no separate backend service, one deploy unit.
- **App-Router-first ecosystem** — Auth.js v5, Supabase SSR, and TanStack Query all assume App Router. We benefit from the most maintained surface.
- **Edge-ready** — token refresh and Tesla command routes are pure fetch + crypto; they can move to Edge runtime later if latency demands it.

## Why Supabase

- **Postgres with RLS** — strong primitives, real SQL, easy migration path to self-hosted later.
- **Built-in auth users + admin API** — pairs naturally with Auth.js.
- **Free tier covers MVP** — no infra cost until traction.
- **Storage + Realtime available later** — live-updating dashboards without changing platforms.

## Why Auth.js v5

- Google + email/password in one library; session management out of the box.
- JWT sessions by default (no extra DB round-trip per request).
- Stable v5 API: `auth()` everywhere we need the session — RSC, route handlers, middleware.

---

## Brand registry pattern

Brand support is **registry-driven**, not subclassed. There are no brand-specific code paths in the UI; everything gates on capability maps.

### File layout

```
src/lib/brands/
├── registry.ts              # BRANDS: Record<BrandKey, BrandProfile>
├── types.ts                 # BrandProfile, BrandCapabilities, TelemetryCapabilities, CommandCapabilities
├── capabilities.ts          # capability map schema helpers
├── models.ts                # per-brand model specs (WLTP figures, charge rates, capacity)
└── <brand>/
    ├── profile.ts           # capability map, displayName, dataSource
    └── adapter.ts           # (raw) => Partial<VehicleState>
```

### BrandProfile shape

```ts
interface BrandProfile {
  key: BrandKey;           // "tesla" | "bmw" | "polestar" | "mercedes" | "vw" | "hyundai" | "renault"
  displayName: string;
  dataSource: "mock" | "live";
  capabilities: {
    telemetry: TelemetryCapabilities;   // 31 fields, each boolean
    commands:  CommandCapabilities;     // 18 commands, each boolean
    history:   HistoryCapabilities;     // chargingSessions, trips, commandLog, retention
    refreshModel: "polling" | "push" | "on-demand";
  };
  adapter: (raw: unknown) => Partial<VehicleState>;
}
```

### Registry lookup

```ts
// src/lib/brands/registry.ts
export const BRANDS: Record<BrandKey, BrandProfile> = {
  tesla, bmw, polestar, mercedes, vw, hyundai, renault
};
export function getBrand(key: string): BrandProfile | null
```

`isLiveEnabled(brand)` (from `src/lib/live-integrations.ts`) reads the `LIVE_INTEGRATIONS` env var and sets `dataSource`. When the var is empty, every brand defaults to `"mock"`.

### API dispatcher

`GET /api/vehicles/:id/state` and `POST /api/vehicles/:id/commands`:

1. Load vehicle row; verify ownership via Auth.js session + `user_id` check.
2. `getBrand(vehicle.brand)` — get profile.
3. If `dataSource === "mock"` → load snapshot from `mock_vehicle_state`, call `tick(snapshot, now, brand)`, persist, normalize through `brand.adapter`.
4. If `dataSource === "live"` → call brand's live adapter.
5. Return typed `VehicleState`.

The decision is row-data (`vehicles.data_source`), not env-data. A single account can mix mock and live vehicles once live integrations reactivate.

---

## VehicleState superset + capability mask

`src/types/vehicle.ts` defines a single `VehicleState` interface that is the **superset of all OEM data fields**. Every field a brand does not expose is `null`. The interface covers:

| Category | Fields (representative) |
|---|---|
| Identity | `vehicleId`, `displayName`, `brand`, `dataSource`, `isOnline` |
| Energy | `batteryLevel`, `batteryRangeKm`, `chargeLimit`, `chargingState`, `chargingRateKw`, `timeToFullMinutes`, `batteryHealthPct`, `cellVoltages` |
| Drive / motion | `motionState`, `odometerKm`, `speedKmh`, `headingDeg`, `latitude`, `longitude` |
| Climate | `interiorTempC`, `exteriorTempC`, `isClimateOn`, `driverTempC`, `passengerTempC`, `hvacMode`, `seatHeatingLevel`, `steeringHeating` |
| Body | `doorsOpen` (4 doors), `windowsOpen` (4 windows), `isTrunkOpen`, `isFrunkOpen` |
| Security | `isLocked`, `isSentryMode`, `isDashcamRecording` |
| Software | `softwareVersion`, `updateAvailable`, `updateVersionLabel`, `serviceDueAt` |
| Tyres | `tirePressures` (frontLeft/Right, rearLeft/Right kPa) |
| Scores | `safetyScore`, `efficiencyScore` |

A field being `null` in the state means either the vehicle reported it as null, or the brand's capability mask does not expose it. The UI treats both cases the same: the card does not render.

### Capability-driven rendering

```tsx
function CommandPanel({ vehicle, state }: Props) {
  const caps = useBrandCapabilities(vehicle.brand)
  return (
    <div className="grid grid-cols-2 gap-2">
      {caps.commands.lock        && <LockButton   vehicle={vehicle} locked={state.isLocked} />}
      {caps.commands.climateOn   && <ClimateBtn   vehicle={vehicle} on={state.isClimateOn} />}
      {caps.commands.honk        && <HonkButton   vehicle={vehicle} />}
      {caps.commands.flash       && <FlashButton  vehicle={vehicle} />}
      {caps.commands.startCharging && <ChargeBtn  vehicle={vehicle} state={state} />}
    </div>
  )
}
```

**Hide, don't disable.** A disabled button signals "feature exists but unavailable right now." That's wrong for "this brand doesn't have this feature." Components hide entirely when the capability is false.

---

## Tier-3 simulator

### Overview

The mock simulator maintains a per-vehicle `MockVehicleSnapshot` persisted in `mock_vehicle_state` (one row per vehicle). On every `GET /api/vehicles/:id/state`, the route handler:

1. Loads the snapshot.
2. Calls `tick(snapshot, now, brand)`.
3. Persists the ticked snapshot.
4. Returns the projected `VehicleState`.

No background worker is required. The 30s TanStack Query polling drives ticks at a frequency well below what matters.

### tick()

```ts
// src/lib/mock/engine.ts
function tick(
  snapshot: MockVehicleSnapshot,
  now: Date,
  brand: BrandProfile,
): MockVehicleSnapshot
```

`tick` is **pure**: given a snapshot + clock, produce the next snapshot. No `Date.now()`, no `Math.random()` calls outside a seeded RNG. Determinism keeps tests reliable and demos reproducible.

The function walks from `snapshot.lastTickAt` to `now` in scenario-step-aligned chunks:

```
while cursor < now:
  step, stepDuration, positionInStep = getStepInfoAt(scenario, cursor)
  chunkSeconds = min(remainingInStep, remainingTotal)
  if step.motionState changed since last chunk → handleTransition()
  current = applyChunk(current, step, chunkSeconds, ...)
  cursor += chunkSeconds
```

#### Physics per motion state

| Motion state | Battery effect | Other |
|---|---|---|
| `driving` | Drain: `(distKm / 100) × efficiencyKwhPer100km / batteryCapacityKwh × 100` pct | Odometer += distKm; location lerped toward targetLocation |
| `charging` | Gain: `chargingRateKw × chunkHours / batteryCapacityKwh × 100` pct, capped at chargeLimit | chargingState = "charging" or "complete" once at limit |
| `plugged-idle` | Same gain as charging if below chargeLimit; 0 rate if at limit | chargingState = "complete" at limit |
| `parked` | Climate drain: 1.5 kW while `isClimateOn = true` | Battery left unchanged otherwise |

### applyCommand()

```ts
function applyCommand(
  snapshot: MockVehicleSnapshot,
  command: CommandName,
  args: Record<string, unknown> | null,
  brand: BrandProfile,
): MockVehicleSnapshot
```

Before mutating state, `applyCommand` checks `brand.capabilities.commands[capKey]`. If `false`, throws `Error("command-not-supported:<command>")`, which the route handler converts to HTTP 422. This means the same rejection logic works in both the API and unit tests — no brand-check duplication.

Commands and their state effects:

| Command | State mutation |
|---|---|
| `lock` / `unlock` | `isLocked` |
| `climate_on` / `climate_off` | `isClimateOn` |
| `set_climate_temp` | `driverTempC = args.temp` |
| `set_charge_limit` | `chargeLimit = clamp(args.limitPct, 50, 100)` |
| `start_charging` / `stop_charging` | `chargingState` |
| `vent_windows` / `close_windows` | `windowsOpen` |
| `activate_sentry` / `deactivate_sentry` | `isSentryMode` |
| `honk`, `flash`, `remote_start` | Side-effect only; no state field |
| `set_charge_amps`, `open_charge_port`, `close_charge_port` | No-op in v1 mock |

### Scenario system

#### CYCLE_ANCHOR

```ts
const CYCLE_ANCHOR_MS = new Date("2026-01-01T00:00:00Z").getTime();
```

All time calculations are relative to this anchor. `getStepInfoAt(scenario, now)` computes:

```
elapsedMs = now - CYCLE_ANCHOR_MS
cycleOffsetMs = elapsedMs % (scenario.cycleDurationSeconds × 1000)   // positive modulo
cycleOffsetSec = cycleOffsetMs / 1000
```

Then walks `scenario.steps` to find the step whose `startOffsetSeconds <= cycleOffsetSec`. The result is `{ step, stepDuration, positionInStep }` — a deterministic answer for any `now`.

#### Scenario JSON format

```json
{
  "id": "commuter",
  "name": "Daily Commuter",
  "description": "...",
  "cycleDurationSeconds": 86400,
  "initialBatteryLevel": 75,
  "vehicle": {
    "batteryCapacityKwh": 75,
    "efficiencyKwhPer100km": 16,
    "maxAcChargingRateKw": 11,
    "maxDcChargingRateKw": 250
  },
  "steps": [
    {
      "startOffsetSeconds": 0,
      "motionState": "charging",
      "location": { "lat": 50.0755, "lng": 14.4378 },
      "chargingRateKw": 7.4,
      "chargingNetwork": "home",
      "climateOn": false
    },
    {
      "startOffsetSeconds": 25200,
      "motionState": "driving",
      "location": { "lat": 50.0755, "lng": 14.4378 },
      "targetLocation": { "lat": 50.0870, "lng": 14.4213 },
      "avgSpeedKmh": 42,
      "climateOn": true,
      "driverTempC": 21
    }
  ]
}
```

`ScenarioStep` fields:

| Field | Required | Notes |
|---|---|---|
| `startOffsetSeconds` | Yes | Seconds from cycle start when this step begins |
| `motionState` | Yes | `"parked"` \| `"driving"` \| `"charging"` \| `"plugged-idle"` |
| `location` | Yes | `{ lat, lng }` — vehicle position at step start |
| `targetLocation` | No | For driving steps; location is lerped from `location` to `targetLocation` over step duration |
| `avgSpeedKmh` | No (driving) | Defaults to 80 km/h if omitted |
| `chargingRateKw` | No (charging) | Defaults to `vehicle.maxAcChargingRateKw` if omitted |
| `chargingNetwork` | No | `"home"` \| `"ionity"` \| `"tesla-sc"` \| `"enbw"` \| `"allego"` \| `"fastned"` \| `"other"` |
| `climateOn` | No | When omitted, climate state carries over from previous step |
| `driverTempC` | No | Only applied when `climateOn = true` |

The `vehicle` block in the scenario is a fallback default. When a vehicle's `vehicleSpec` is set (from `models.ts` at seed time), it overrides the scenario defaults for `batteryCapacityKwh`, `efficiencyKwhPer100km`, and charge rates. This makes the same scenario drive correctly for a 60 kWh Renault and a 107 kWh Mercedes.

### Session boundary detection

`handleTransition(snapshot, from, to, at)` runs whenever motion state changes between scenario chunks:

- `driving → anything`: clears `activeTripStart` (persistence layer detects null = "close trip")
- `charging/plugged-idle → anything`: clears `activeChargingSessionStart`
- `anything → driving`: sets `activeTripStart`, `activeTripStartLat/Lng`, `activeTripStartOdometerKm`
- `anything → charging/plugged-idle`: sets `activeChargingSessionStart`, `activeChargingSessionStartSoc`

`saveSnapshot` (persistence layer) compares `prev` and `next` snapshots. If `prev.activeTripStart` was set and `next.activeTripStart` is null, it inserts a `trips` row. Same pattern for charging sessions → `charging_sessions` row. Calculated fields:

- `distance_km = odometerKm_now - activeTripStartOdometerKm`
- `avg_speed_kmh = (distance_km / durationSeconds) × 3600`
- `energy_added_kwh = (endSoc - startSoc) / 100 × batteryCapacityKwh` (approximated)

---

## History tracking — database tables

Migration `002_mock_platform.sql` creates:

### mock_vehicle_state

One row per vehicle. Updated on every tick. Stores the full `VehicleState` as JSONB plus motion tracking fields.

```sql
vehicle_id                         uuid PK → vehicles(id)
state                              jsonb           -- full VehicleState
motion_state                       text            -- parked | driving | charging | plugged-idle
scenario_id                        text
last_tick_at                       timestamptz
active_charging_session_start      timestamptz
active_charging_session_network    text
active_charging_session_start_soc  integer
active_trip_start                  timestamptz
active_trip_start_lat/lng          numeric(9,6)
active_trip_start_odometer_km      numeric(10,2)
```

### charging_sessions

```sql
id, vehicle_id, started_at, ended_at, energy_added_kwh,
start_soc, end_soc, network, cost_eur,
location_lat, location_lng, location_name, max_charging_rate_kw
```

Indexed on `(vehicle_id, started_at DESC)`.

### trips

```sql
id, vehicle_id, started_at, ended_at,
start_lat, start_lng, end_lat, end_lng,
start_address, end_address,
distance_km, energy_used_kwh, avg_speed_kmh, max_speed_kmh, efficiency_kwh_per_100km
```

Indexed on `(vehicle_id, started_at DESC)`.

### command_events

Audit log of all user commands.

```sql
id, vehicle_id, command, args (jsonb), success, error_code,
source (user | automation), issued_at
```

All four tables have RLS policies that restrict rows to the vehicle's owner via `auth.uid()`.

---

## Tariff provider abstraction

Tariff providers follow the same registry pattern as brands:

```
src/lib/external/tariffs/
├── registry.ts          # TARIFF_PROVIDERS = { tibber-mock, octopus-mock, awattar-mock }
└── <provider>/
    ├── provider.ts
    └── fixtures.ts      # hourly prices, forecast, off-peak windows
```

Provider shape:

```ts
interface TariffProvider {
  id: string;
  displayName: string;
  getHourlyPrices(date: Date): HourlyPrice[];    // 24 entries
  getForecast(): HourlyPrice[];                  // next 24h
  getCurrentPrice(): number;                     // €/kWh
  getOffPeakWindow(): { start: number; end: number };  // hours
}
```

The user picks an active provider in Settings. The `/energy` page reads it. When real APIs are plugged in (roadmap 0.5+), only the underlying fetch changes; the shape stays.

---

## Database schema overview

```
profiles          — Auth.js mirror of auth.users rows
vehicles          — per-user vehicles (brand, model, data_source, scenario_id)
tesla_tokens      — AES-256-GCM encrypted OAuth tokens (legacy live Tesla)
vehicle_snapshots — append-only polling snapshots (legacy live Tesla)

mock_vehicle_state — one row per vehicle; current simulator state
charging_sessions  — completed charging sessions, derived from simulator
trips              — completed trips, derived from simulator
command_events     — audit log of all user commands
```

All tables have RLS. The app never accesses Supabase from the browser with data queries — all reads and writes go through `/api/*` route handlers that use the service-role client after verifying the Auth.js session.

---

## Multi-vehicle UX

Routes:

- `/garage` — default landing; grid of vehicle cards + fleet aggregates.
- `/dashboard?v=<vehicleId>` — deep card view.
- `/energy` — tariffs + smart charging recommendations.
- `/charging-map` — charging-network discovery map.
- `/trip` — trip planner with charging-stop insertion.
- `/about-data` — mock-vs-live transparency table.

Top nav has a **vehicle switcher pill** (current vehicle + dropdown of others). Dashboard, Trip, and Charging-Map pages all act on the active vehicle.

---

## Mock disclosure

| Surface | When it appears |
|---|---|
| `MOCK` chip in card header (amber) | Vehicle has `dataSource === "mock"` |
| Global "Demo mode" banner | All user vehicles are mock |
| `/about-data` transparency page | Always available; lists live-vs-mock per data category |

The chip tooltip and the banner both link to `/about-data`. The product is honest: we never label simulated data as live.

---

## Legacy live-Tesla preservation

The original Tesla code (OAuth + PKCE + region probe + token refresh + AES-256-GCM encryption) stays in the tree. Re-deriving it would cost days; keeping it costs one flag check.

- `LIVE_INTEGRATIONS` env: comma-separated brand keys. When `tesla` is in the list, the Tesla brand profile switches `dataSource = "live"`.
- `tesla-proxy/` (Dockerfile + fly.toml) stays; README marked "currently dormant."
- `/connect/tesla` and `/api/tesla/*` routes return `410 Gone` when `tesla` is not in `LIVE_INTEGRATIONS`.

See `docs/VEHICLE-CONNECTION.md` for reactivation steps and the full OAuth flow.

---

## TanStack Query polling strategy

- **30-second `refetchInterval`** while the tab is active.
- **20-second `staleTime`** prevents duplicate fetches within the polling window.
- **`refetchOnWindowFocus: false`** — refocus does not double-fire alongside the interval.
- **Mutations invalidate** the relevant `["vehicle", vehicleId]` query for immediate feedback.

---

## Implementation decisions

### 1. Next.js 16, not 15

`npx create-next-app@latest` shipped Next.js 16.2 at the time of scaffolding. `params`/`searchParams` are `Promise<…>` and `cookies()` is async — all code is written against the Next 16 conventions documented in `node_modules/next/dist/docs`.

### 2. Tailwind v4 with OKLCH tokens

Tailwind v4 is the default in `create-next-app@16`. CSS variables wired via `@theme inline` block in `globals.css`. Colors use OKLCH for perceptually uniform contrast across light/dark.

### 3. shadcn primitives are hand-written

`shadcn init` is interactive in Node 18. All primitives in `src/components/ui/` are written by hand against documented shadcn New York patterns. `components.json` is included so the upstream CLI can layer in additional primitives without conflict.

### 4. Supabase client choices

- **Browser**: `createBrowserClient` from `@supabase/ssr`.
- **Server (request-bound)**: `createServerClient` from `@supabase/ssr` with async `cookies()`.
- **Admin (service role)**: plain `@supabase/supabase-js` client, used in route handlers after verifying the Auth.js session.

RLS still protects the DB at the platform level; app-level authorization is enforced by Auth.js + explicit `eq("user_id", session.user.id)` filters.

### 5. Auth.js + Supabase user identity

First Google sign-in: Auth.js `jwt` callback calls `supabase.auth.admin.createUser`. This produces an `auth.users` row whose `id` becomes the canonical user identity. The `handle_new_user` trigger mirrors it to `profiles`. Because Supabase sessions are not used, RLS policies that test `auth.uid()` won't see the user — all server-side data access uses the service-role client with explicit `user_id` filters.

### 6. Simulator tick is driven by reads, not a cron

Advancing state on every read (rather than a background job) keeps the infrastructure simple for the mock-first MVP. The 30s polling interval on the dashboard is sufficient to produce plausible real-time updates. The design naturally upgrades to a background tick job later if needed.

### 7. Disconnect ≠ revoke (legacy Tesla)

`DELETE /api/vehicles/:id` removes the local row and cascades the tokens. It does not call Tesla's token revocation endpoint. The encrypted tokens are destroyed locally, so access is functionally gone from Flux's side.

### 8. Document processing is fire-and-forget

`POST /api/documents` uploads the file, inserts a `pending` row, and returns `202` immediately. `processDocument(id)` runs async (`.catch()` updates the row to `error` on failure). This keeps the upload response fast regardless of Claude Vision latency (~2–5s per document).

### 9. Cost attribution fallback

When a home bill covers a period with no charging sessions in history (e.g. first upload, or mock data date mismatch), attribution returns `sessionCount = 0`. Rather than storing `cost_ron = 0`, the processor stores the full bill cost and flags the document as `needs_review`. The user can then edit the value manually.

---

## Cost Intelligence

See `docs/COST-INTELLIGENCE.md` for full detail. Summary of modules:

| Module | Path | Role |
|---|---|---|
| Document parser | `src/lib/ai/document-parser.ts` | Claude Vision API call + Zod validation |
| Extraction prompt | `src/lib/ai/prompts/document-extraction.ts` | Romanian prompt + MIME type list |
| Processor | `src/lib/costs/processor.ts` | Pipeline: parse → convert → attribute → insert |
| Attribution | `src/lib/costs/attribution.ts` | Home bill → vehicle kWh fraction |
| Session matcher | `src/lib/costs/session-matcher.ts` | Public receipt → nearest charging session |
| BNR client | `src/lib/external/bnr/client.ts` | Exchange rate with Supabase cache |
| Document API | `src/app/api/documents/route.ts` | Upload + list with signed URLs |
| Email webhook | `src/app/api/documents/inbound-email/route.ts` | Cloudmailin/Mailgun/SendGrid inbound |
| Cost API | `src/app/api/costs/route.ts` | Aggregation + monthly trend |
