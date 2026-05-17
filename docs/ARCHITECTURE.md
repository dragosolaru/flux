# ARCHITECTURE — Flux

> **Post-pivot note (2026-05-17).** This document describes both the **current direction** (mock-first, multi-brand, capability-driven UI, Tier-3 simulator) and the **preserved legacy** (real Tesla integration that stays in-tree behind a feature flag). When two sections appear to disagree, the post-pivot sections (§Brand registry, §Tier-3 simulator, §Capability-driven UI, §External-data abstraction) are authoritative; the original Tesla-specific sections describe code that remains in the repo but is gated by `LIVE_INTEGRATIONS`. The formal source of truth for what changes is `openspec/changes/pivot-mock-first-platform/`.

## DAO Lab engineering standards

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
- **Built-in auth users + admin API** — pairs naturally with Auth.js. We register users in Supabase's `auth.users` and use Auth.js purely for session management.
- **Free tier covers MVP** — no infra cost until traction.
- **Storage + Realtime available later** — we can add charging session storage and live-updating dashboards without changing platforms.

## Why Auth.js v5

- Google + email/password in one library; session management out of the box.
- JWT sessions by default (no extra DB round-trip per request).
- Stable v5 API: `auth()` everywhere we need the session — RSC, route handlers, middleware.

## Tesla OAuth flow

```
 ┌──────────┐    1. click "Connect"    ┌──────────────────────┐
 │ Browser  │ ───────────────────────► │  GET /api/tesla/     │
 │          │                          │       connect        │
 │          │                          └──────────┬───────────┘
 │          │                                     │
 │          │   2. set HttpOnly cookies           │
 │          │   ◄─── (pkce_verifier, state) ──────┤
 │          │                                     │
 │          │   3. 302 redirect to                │
 │          │      auth.tesla.com ◄──────────────┘
 │          │
 │          │    4. user authenticates with Tesla
 │          │
 │          │    5. Tesla 302s back to
 │          │       /api/tesla/callback?code=…&state=…
 │          │ ───────────────────────► ┌──────────────────────┐
 │          │                          │  GET /api/tesla/     │
 │          │                          │       callback       │
 │          │                          │                      │
 │          │                          │  - validate state    │
 │          │                          │  - exchange code     │
 │          │                          │    for tokens (PKCE) │
 │          │                          │  - probe regions     │
 │          │                          │  - encrypt + persist │
 │          │                          │  - 302 /dashboard    │
 │          │                          └──────────────────────┘
 │          │
 │ /dashboard polls /api/tesla/vehicle every 30s
 │          │ ───────────────────────► (auth → load token →
 │          │                            refresh if expiring →
 │          │                            call Tesla → parse →
 │          │                            insert snapshot → return)
 └──────────┘
```

## Token encryption rationale

OAuth tokens granted by Tesla are **bearer credentials**: anyone with the access token can read vehicle data and send commands until it expires. Even though Supabase RLS already prevents cross-user reads, we treat the database as a sensitive-data boundary:

- A future operations mistake (accidentally exposed backup, mis-scoped service role key, dev sharing a dump for debugging) should not leak working Tesla credentials.
- AES-256-GCM with a per-record IV provides both confidentiality and integrity. The encryption key lives only in the server's environment, never in the DB.
- The cost is negligible (~50 µs per encrypt/decrypt) compared to the round-trip to Tesla.

## TanStack Query polling strategy

- **30-second `refetchInterval`** while the dashboard tab is active. Tesla's Fleet API rate limits per app comfortably support this for a single vehicle.
- **20-second `staleTime`** prevents a `useVehicle()` call from a different mounted component triggering a duplicate fetch within the polling window.
- **`refetchOnWindowFocus: false`** — refocusing the tab does not double-fire alongside the interval.
- **Mutations invalidate** the relevant `["vehicle", vehicleId]` query, so a successful lock/unlock surfaces the new locked state on the next poll without waiting up to 30s.

When the user is on `/charging`, the same hook is used, so polling state is shared across pages — no thundering herd.

## Multi-brand extensibility (post-pivot: brand registry + capability map)

The internal `VehicleState` type (in `src/types/vehicle.ts`) is **brand-agnostic** by design. Post-pivot, it is also a **superset** covering all 11 OEM telemetry categories (identity, energy, drive, climate, body, security, software, efficiency, trips, charging history, subscriptions, safety). Fields a given brand does not expose are `null`; the UI hides them rather than rendering placeholders.

Brand support is **registry-driven**, not subclassed:

```
src/lib/brands/
├── registry.ts              # BRANDS = { tesla, bmw, polestar, mercedes, vw, hyundai, renault }
├── types.ts                 # BrandProfile, BrandCapabilities
├── capabilities.ts          # capability map schema
└── <brand>/
    ├── profile.ts           # capability map, displayName, data source
    └── adapter.ts           # (raw) => Partial<VehicleState>
```

Each `BrandProfile` exposes:

- `key`: stable identifier
- `displayName`
- `capabilities`: nested map of telemetry fields and commands the brand supports
- `dataSource`: `mock` | `live`
- `adapter`: pure function mapping raw API output → internal `VehicleState`

UI components read `useBrandCapabilities(currentBrand)` and gate themselves accordingly. A Tesla card is rich; a Polestar card has no Honk button, no Sentry card, no cell-voltages panel — these literally don't render. The same JSX produces seven different cards.

`vehicles.brand` and `vehicles.data_source` columns on the DB drive the dispatcher in `/api/vehicles/:id/{state,commands}`. The dispatcher's behavior:

1. Load vehicle row, verify ownership.
2. Look up the brand profile.
3. If `dataSource === "mock"` → call the mock simulator (`src/lib/mock/engine.ts`).
4. If `dataSource === "live"` → call the brand's live adapter.
5. Normalize through the brand adapter → typed `VehicleState`.

The decision point is row-data, not env-data. A single account can mix mock and live vehicles when live integrations come back online.

## Tier-3 stateful mock simulator

The simulator is the engine room of the mock-first MVP. Goals:

- Commands actually do something (lock changes `isLocked`, climate drains battery, charge limit affects time-to-full).
- History accumulates (charging sessions, trips, monthly cost).
- Brand capabilities are validated end-to-end (the simulator refuses to perform commands a brand can't do).

### Shape

```ts
// src/lib/mock/engine.ts
interface MockVehicleSnapshot {
  state: VehicleState
  motionState: "parked" | "driving" | "charging" | "plugged-idle"
  scenarioId: string | null
  scenarioStep: number
  lastTickAt: string
}

function tick(snapshot: MockVehicleSnapshot, now: Date, brand: BrandProfile): MockVehicleSnapshot
function applyCommand(snapshot: MockVehicleSnapshot, command: string, args: unknown, brand: BrandProfile): MockVehicleSnapshot
```

`tick` is **pure**: given a snapshot + clock + brand, produce the next snapshot. No `Date.now()`, no `Math.random()` outside an explicit seeded RNG. Determinism keeps tests reliable and demos reproducible.

### Persistence

`mock_vehicle_state` (one row per vehicle) stores the latest snapshot + `last_tick_at`. On every `GET /api/vehicles/:id/state`, the handler:

1. Loads the row.
2. Ticks to `now` (advancing battery, location, odometer, motion-state transitions, scenario steps).
3. Persists the new snapshot.
4. Returns the projected `VehicleState`.

No background worker required for v1. The 30s dashboard polling drives ticks at a rate well below what would matter.

### Scenarios

Scenarios are JSON files (`commuter.json`, `road-trip.json`, `weekend-errands.json`, `vacation.json`) describing ordered steps with timestamps, motion transitions, and waypoints. The engine advances `scenarioStep` based on wall-clock progression so an idle account opened at 18:00 shows vehicles plausibly arriving home from work.

### Charging sessions & trips

The engine detects `motionState === "charging"` runs and aggregates them into `charging_sessions` rows (`started_at`, `ended_at`, `energy_added_kwh`, `start_soc`, `end_soc`, `network`, `cost_eur`, `location_lat/lng`). Similarly, `motionState === "driving"` runs aggregate into `trips`. This makes the History pages real data, not fake fixtures.

## Capability-driven UI

Components never check `vehicle.brand === "tesla"`. They check `caps.commands.honk`, `caps.telemetry.cellVoltages`, etc.

```tsx
function CommandPanel({ vehicle, state }: Props) {
  const caps = useBrandCapabilities(vehicle.brand)
  return (
    <div className="grid grid-cols-2 gap-2">
      {caps.commands.lock     && <LockButton  vehicle={vehicle} locked={state.isLocked} />}
      {caps.commands.climate  && <ClimateBtn  vehicle={vehicle} on={state.isClimateOn} />}
      {caps.commands.honk     && <HonkButton  vehicle={vehicle} />}
      {caps.commands.flash    && <FlashButton vehicle={vehicle} />}
      {caps.commands.charge   && <ChargeBtn   vehicle={vehicle} state={state} />}
    </div>
  )
}
```

The same pattern applies to `StatsGrid`, detail panels, and even page-level nav (a brand without trip history doesn't show a "Trips" tab).

### Hide, don't disable

Disabled buttons signal "this feature exists but you can't use it right now." That's the wrong message for "this brand doesn't have this feature." Hide entirely. The UI is honest about brand differences.

## External-data abstraction (beyond OEM)

Tariffs, charging-network discovery, weather, and routing all follow the **same registry pattern** as brands:

```
src/lib/external/
├── tariffs/
│   ├── registry.ts          # TARIFF_PROVIDERS = { tibber-mock, octopus-mock, awattar-mock }
│   └── <provider>/
│       ├── provider.ts
│       └── fixtures.ts
├── charging-networks/
│   ├── registry.ts          # NETWORKS = { ionity, tesla-sc, enbw, allego, fastned }
│   └── stations.ts          # ~50 EU stations with stalls + plug types + max kW + base price
├── weather/
│   ├── registry.ts
│   └── mock-provider.ts
└── routing/
    ├── registry.ts
    └── mock-router.ts       # great-circle + waypoint heuristic, charging-stop insertion
```

The user picks active providers in settings. The dashboard reads the active provider. When real APIs are plugged in (roadmap 0.5+), only the underlying fetch changes; the shape stays.

## Multi-vehicle UX

Routes:

- `/garage` (default landing) — grid of vehicle cards + fleet aggregates.
- `/dashboard?v=<vehicleId>` — deep card view.
- `/energy` — tariffs + smart charging.
- `/charging-map` — nearby stations.
- `/trip` — trip planner.
- `/about-data` — mock-vs-live transparency table.

Top nav has a **vehicle switcher pill** (current vehicle + dropdown of others). The Dashboard, Trip, and Charging-Map pages all act on the active vehicle.

Fleet totals on the Garage page sum across all vehicles for: combined available range, kWh charged this month, monthly cost, CO₂ saved vs. ICE baseline. The smart-charge coordinator (across multiple plugged-in vehicles) and the "Which car?" recommender live on the Garage too.

## Mock disclosure

The product is honest about which data is simulated:

| Surface                                | When it appears                                              |
| -------------------------------------- | ------------------------------------------------------------ |
| `MOCK` chip in card header (amber)     | Vehicle has `dataSource === "mock"`                          |
| Global "Demo mode" banner              | Every vehicle on the account is mock                         |
| `/about-data` transparency page        | Always available; lists live-vs-mock per data category       |

The chip tooltip and the banner both link to `/about-data`. We never tell the user "this is live" when it isn't.

## Legacy live-Tesla preservation

The original Tesla code (OAuth + PKCE + region probe + token refresh + AES-256-GCM encryption + vehicle-data parser + command routes) **stays in the tree**. Re-deriving it would cost days; the cost of keeping it is one env flag check and an unused import path.

- `LIVE_INTEGRATIONS` env: comma-separated brand keys (`tesla,bmw,...`). When `tesla` is in the list, the Tesla brand profile is allowed `dataSource = "live"`. Otherwise, all Tesla vehicles are forced to mock regardless of DB row state.
- `tesla-proxy/` (Dockerfile + fly.toml + entrypoint) stays. Its README is marked "currently dormant."
- `/connect/tesla` and `/api/tesla/*` routes return 410 Gone with a JSON message when `tesla` is not in `LIVE_INTEGRATIONS`.

### Reactivation procedure (future phase 0.2)

1. Set `LIVE_INTEGRATIONS=tesla` in Vercel env.
2. Deploy `tesla-proxy/` on Fly.io per the original NEXT-STEPS plan (preserved in git history).
3. Set `TESLA_PROXY_BASE_URL` on Vercel.
4. From the UI, the "Add real Tesla" CTA reappears in onboarding.
5. Existing mock Tesla vehicles can be converted to live by user action (re-OAuth and flip `data_source = 'live'` on the row).

## Implementation decisions

The bootstrap prompt explicitly asked for any non-obvious decisions to be recorded here. The notable ones:

### 1. We landed on Next.js 16, not 15

`npx create-next-app@latest` shipped Next.js **16.2** at the time of scaffolding (Jan 2026 cutoff: Next 16 GA). The breaking changes vs. 15 are minor for this stack — `params`/`searchParams` are already `Promise<…>` (carried over from 15.0), and `cookies()` is async (same). All code is written against the Next 16 conventions documented in `node_modules/next/dist/docs`.

### 2. Tailwind v4 with OKLCH tokens

Tailwind v4 is the default in `create-next-app@16`. We use the new `@theme inline` block in `globals.css` to wire CSS variables to Tailwind utility classes (`bg-background`, `text-foreground`, etc.). Color tokens use **OKLCH** for perceptually uniform contrast across light/dark modes. shadcn's "new-york" style is replicated manually because the official shadcn CLI requires Node ≥ 20 and we wanted the scaffold to work without forcing a Node bump.

### 3. shadcn primitives are hand-written, not generated

We did not run `shadcn init` (it is interactive in Node 18). All primitives in `src/components/ui/` are written by hand against the documented shadcn New York patterns. `components.json` is included so the upstream CLI can layer in additional primitives later without conflict.

### 4. Supabase client choices

- **Browser**: `createBrowserClient` from `@supabase/ssr` — wired in `src/lib/supabase/client.ts`.
- **Server (request-bound)**: `createServerClient` from `@supabase/ssr` with the Next 16 async `cookies()`. Use this when an RLS-aware query is needed.
- **Admin (service role)**: a plain `@supabase/supabase-js` client. We use this in route handlers **after** verifying the Auth.js session, because Auth.js owns the source of truth for the user identity in this app, not Supabase's session cookie.

The pragmatic effect: RLS still protects the DB at the platform level, but our app-level authorization is enforced by Auth.js + explicit `eq("user_id", session.user.id)` filters in service-role queries.

### 5. Auth.js + Supabase user identity

When a user signs in with Google for the first time, the Auth.js `jwt` callback calls `supabase.auth.admin.createUser({ email, email_confirm: true })`. This produces a `auth.users` row whose `id` becomes the canonical user identity throughout the app. The `handle_new_user` Postgres trigger then mirrors that row into `profiles`. Credentials sign-in delegates to Supabase directly via `signInWithPassword`.

This means the Supabase `auth.users` table is the source of truth for user IDs, even though session management is owned by Auth.js. RLS policies that test `auth.uid()` won't see this user automatically because we're not using Supabase sessions — that's why our server-side data access uses the service-role client with explicit `user_id` filters.

### 6. PKCE for Tesla OAuth

Tesla's Fleet API supports PKCE. We use it even though we're a confidential client (we have a `TESLA_CLIENT_SECRET`). The verifier is stored in an HttpOnly cookie scoped to the OAuth window (10 minutes). Combined with the `state` parameter, this defends against CSRF on the callback.

### 7. Region detection by probe

The Tesla Fleet API is region-partitioned (EU / NA / CN). The callback handler tries each region's `/api/1/vehicles` endpoint with the freshly issued access token. The first region that returns ≥ 1 vehicle wins and is stored on the `vehicles.tesla_region` column. Subsequent calls use that region without re-probing.

### 8. Snapshot writes are fire-and-forget

The vehicle GET route writes a `vehicle_snapshots` row on every successful fetch, but does not await it. The user's dashboard latency is bound only by Tesla's API; the snapshot write happens in the background. This is acceptable because:

- A dropped snapshot only loses one polling sample (we have a snapshot every 30s).
- The `vehicle_snapshots` table is append-only and used for history, not source-of-truth state.

### 9. Charging history is read from snapshots, not Tesla

Tesla doesn't expose a clean "charging session history" endpoint, so we synthesize it client-side: any snapshot with `is_charging = true`, sorted descending. This is naïve (one session can span many snapshots) but works for the MVP charging page. A future improvement: a server-side job that collapses consecutive `is_charging` snapshots into discrete `charging_sessions` rows.

### 10. Disconnect ≠ revoke

`DELETE /api/vehicles/:id` removes the local row and cascades the tokens. It does **not** call Tesla's token revocation endpoint. If we wanted to be a strictly polite OAuth client, we would `POST /oauth2/v3/revoke` first. The current trade-off is operational simplicity; the encrypted tokens are destroyed locally so the access is functionally gone from Flux's side.
