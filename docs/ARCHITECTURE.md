# ARCHITECTURE — Flux

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

## Multi-brand extensibility

The internal `VehicleState` type (in `src/types/vehicle.ts`) is **brand-agnostic** by design:

```
VehicleState
├── batteryLevel, batteryRangeKm, chargingState, chargingRateKw, …
├── interiorTempC, exteriorTempC, isClimateOn
├── isLocked, isSentryMode
└── latitude, longitude
```

Adding BMW will look like:

```
src/lib/bmw/
├── constants.ts   # endpoints, regions
├── auth.ts        # ConnectedDrive OAuth
├── tokens.ts      # encrypt/refresh (likely reuses crypto helpers)
└── api.ts         # maps BMW responses → VehicleState
```

The `vehicles.brand` column on the DB and a small dispatcher in `/api/<brand>/vehicle` are the only places that need to know about brand selection. UI components are already brand-blind.

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
