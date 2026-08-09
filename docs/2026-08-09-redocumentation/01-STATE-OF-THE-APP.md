# 01 — State of the App

*Ground truth as of 2026-08-09, read from code rather than from documentation.*

---

## What Flux is

An EV management PWA for Tesla owners, built by DAO Lab. It does five things
the first-party Tesla app does not: automatic cost tracking from OCR'd
receipts, tariff-aware smart charging, real-road trip planning with charging
stops, a deduplicated multi-source charger map, and a document vault for the
car's paperwork. It runs in five languages and installs to a phone home screen.

Every vehicle is either `mock` (a deterministic simulator) or `live` (a real
Tesla via the Fleet API). The same UI, the same capability gates, the same
database tables serve both.

**Stack:** Next.js 16 App Router · TypeScript strict · Auth.js v5 ·
Supabase Postgres + PostGIS · TanStack Query v5 · Tailwind v4 · next-intl v4 ·
Zod · Upstash Redis · Anthropic Claude (OCR) · Stripe · Vercel.

---

## The headline correction

`README.md` and `docs/ROADMAP.md` both say the live Tesla integration is
"wired but dormant". **That is out of date.**
`docs/TESLA-API-CAPABILITIES.md:15-30` — updated today — states that OAuth with
all nine scopes, `vehicle_data` with location, 20 signed commands through the
proxy, and Virtual Key pairing are all live *with a real car linked*. The last
40 commits are a sustained debugging campaign against exactly this surface,
ending in `e81141b` today.

The correct current statement is: **live Tesla works; the next frontier is
Fleet Telemetry**, which cannot run on Vercel and needs the self-hosted box.

---

## Screens

Fourteen routes under `src/app/(dashboard)/`. Line counts are a rough proxy for
how much is really there.

| Route | Size | Status | Notes |
|---|---|---|---|
| `/dashboard` | 804 | **SHIPPED** | Deep single-vehicle view. Battery, climate, closures, tyres, software, dashcam, scores. |
| `/garage` | 268 | **SHIPPED** | Default landing. Fleet grid, add/deactivate vehicles. |
| `/map` | 2163 | **SHIPPED** | The big one. Explore chargers *and* plan trips in one screen, bottom-sheet driven. Saved routes, share, preconditioning, corridor stations. |
| `/costs` | 870 | **SHIPPED** | Cost Intelligence dashboard — monthly trend, home vs public split, petrol comparison. |
| `/documents` | 807 | **SHIPPED** | Document vault. Upload, calendar, expiry tracking. |
| `/settings` | 703 | **SHIPPED** | Locale, currency, home location, tariff provider, Tesla connection, danger zone. |
| `/charging` | 510 | **SHIPPED** | Charging session history + manual sync. |
| `/insights` | 453 | **SHIPPED** | Derived analytics. |
| `/charging-map` | 321 | **SHIPPED but redundant** | Explore-only charger map. `/map` does this plus planning, from the same API. See issue D-1. |
| `/energy` | 257 | **PARTIAL** | Tariff page + smart-charge card. Only Tibber is a real provider; the rest are mock curves. |
| `/commands` | 143 | **SHIPPED** | Per-vehicle command panel behind `FeatureGate(COMMANDS)`. |
| `/about-data` | 128 | **SHIPPED** | Mock-vs-live transparency page. Genuinely unusual, genuinely good. |
| `/debug` | 2252 | **SHIPPED, admin-only** | The operations console. Bigger than any product screen — see below. |
| `/trip` | 14 | **RETIRED** | Redirects to `/map?mode=plan`. Correctly done: a redirect, not a delete, so bookmarks survive. |

### On `/debug`

At 2252 lines it is the largest screen in the app, larger than `/map`. That is
not an accident and not obviously wrong: it is the console from which the Tesla
go-live is driven — key rotation, partner registration, pairing checks, ingest
runs, migration runner, OCR probes. It is gated by `requireAdmin()`
(`src/lib/admin.ts`), which resolves against the `ADMIN_EMAILS` env allowlist
and returns **404, not 403**, so the surface does not advertise itself.

It is worth naming as a deliberate asset rather than debt. It is also worth
watching: an operations console that grows faster than the product is a signal
about where the effort is going.

---

## API surface — 70 routes

Auth coverage was enumerated mechanically across every `route.ts`.

### Authenticated user routes (52)

All call `await auth()` and check `session?.user?.id`. Vehicle-scoped routes
additionally filter on `user_id`.

`/api/vehicles/*` (13 routes: state, commands, command-history, stats,
battery-health, charging-history, weather, vault ×5) · `/api/costs`,
`/api/costs/export` · `/api/documents/*` (4) · `/api/saved-routes/*` (2) ·
`/api/tariffs/*` (2) · `/api/me/*` (3) · `/api/user/export`, `/api/user/delete` ·
`/api/tesla/*` (6) · `/api/trip-plan` · `/api/chargers/*` (5) · `/api/push/*` (2) ·
`/api/billing/checkout`, `/api/billing/portal` · `/api/geocode` ·
`/api/exchange-rates` · `/api/feedback`.

**Flagged for a human IDOR pass** — these authenticate but showed no `user_id`
filter, which is *probably* correct because the data is not user-scoped, but was
not individually verified: `/api/chargers/*` (shared charger table),
`/api/geocode`, `/api/exchange-rates`, `/api/feedback`,
`/api/billing/{checkout,portal}`, `/api/me/preferences`, `/api/push/test`.

### Admin-only (11)

Every route under `/api/internal/debug/` — `cache`, `dedupe`, `ingest`,
`migrations`, `ocr`, `probe`, `source-probe`, `tesla-fleet-status`,
`tesla-keypair`, `tesla-partner`, and the root `debug`. All eleven call
`requireAdmin()`. Verified: **zero unguarded routes** in that tree.

### Secret-authenticated (5)

| Route | Guard |
|---|---|
| `/api/cron/poll-vehicles` | `CRON_SECRET` bearer, constant-time, fails closed |
| `/api/internal/warm` | `CRON_SECRET` **or** `INGEST_WEBHOOK_SECRET`, constant-time, fails closed |
| `/api/internal/ingest-stats` | same |
| `/api/documents/inbound-email` | `EMAIL_WEBHOOK_SECRET` via `x-webhook-secret` header, `timingSafeEqual` |
| `/api/documents/inbound-whatsapp` | Twilio HMAC signature, `timingSafeEqual` |

### Deliberately public (3)

`/api/auth/[...nextauth]`, `/api/auth/register`, `/api/push/vapid-public-key`,
and `/api/tesla-public-key` (Tesla's fetcher is unauthenticated by design — it
serves only the *public* half of the signing key).

### Dead routes (2)

`/api/charging-map` and `/api/charging-stations` have **zero consumers** in
`src/` or `e2e/`. Both are superseded by `/api/chargers`. See issue D-2.

---

## Modules

| Area | Status | Notes |
|---|---|---|
| `lib/tesla/` | **SHIPPED** | Fleet API client, PKCE OAuth, AES-256-GCM token vault, charging history. Charging history returns 403 on personal accounts — business fleet only. |
| `lib/brands/` | **SHIPPED** | Capability registry. Tesla-only; six other brands archived on `demo-brands-archive`. |
| `lib/mock/` | **SHIPPED** | Tier-3 simulator: physics-based drain, real AC/DC charge curves, commands mutate persistent state. |
| `lib/chargers/` | **SHIPPED** | PostGIS pipeline — OCM + OSM + TomTom + BNetzA/NDW/IRVE/Austria, deduped by site. The most substantial subsystem after the map. |
| `lib/costs/` | **SHIPPED** | OCR → attribution → aggregation. Home bills split proportionally by charging history. |
| `lib/ai/` | **SHIPPED** | Claude Vision document parser. One prompt module is dead — see D-3. |
| `lib/external/routing/` | **SHIPPED** | OSRM / ORS / TomTom multi-strategy, Open-Meteo weather derating. |
| `lib/external/tariffs/` | **PARTIAL** | Tibber real; Octopus, aWATTar, and all four Romanian providers are mock curves. |
| `lib/external/charging-networks/` | **MOSTLY DEAD** | Only `corridor-stations.ts` and `planner.ts` still use it; its two API routes are dead. |
| `lib/notifications/` + `lib/push/` | **DARK** | Complete — alert engine, dispatch, VAPID, preferences UI. Gated off by `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`. |
| `lib/migrations/` | **SHIPPED** | In-app migration runner driven from `/debug`. Compensates for having no CI migration step. |
| `lib/rate-limit.ts` | **SHIPPED** | Upstash sliding window, with an in-memory fallback that is per-process and therefore near-useless on serverless. Upstash is mandatory in production. |
| `lib/subscription.ts` | **STUBBED OPEN** | `canUploadDocument` and `canUploadVaultDocument` return `{allowed: true}` unconditionally. See S-2 / issue B-1. |
| `lib/roadmap.ts` | **SHIPPED** | Machine-checked milestone list rendered in `/debug`. The most trustworthy roadmap in the repo. |

---

## Data

44 migrations in `supabase/migrations/`, applied **manually** through the
Supabase SQL editor — there is no CI runner. `lib/migrations/registry.ts` plus
`/api/internal/debug/migrations` provide an in-app runner as the workaround.

Four migrations are called out as unapplied in `docs/LAUNCH-CHECKLIST.md`:
`031_enable_rls_charger_tables` (**security-critical** — without it the anon key
grants read/write on `chargers`, `charger_connectors`, `charger_sources`,
`ingest_runs`, `exchange_rates` through PostREST), `032_saved_routes`,
`033_saved_routes_index`, `034_dedupe_chargers_by_site`. Whether they have since
been applied could not be verified from the repository.

---

## Engineering quality

Measured, not asserted:

- `npx tsc --noEmit` → **exit 0**
- `npm run lint` → **clean**
- `: any` / `as any` / `@ts-ignore` across `src/` → **zero occurrences**
- i18n parity → **1019 keys in each of en, ro, de, fr, hu; zero drift**
- `TODO`/`FIXME`/`HACK` in real source → **one** (`src/lib/subscription.ts:68`)
- Secret comparison → `timingSafeEqual` / `constantTimeEqual` everywhere checked
- CSP → nonce-based with `strict-dynamic`, `frame-ancestors 'none'`, plus HSTS,
  `X-Frame-Options: DENY`, `nosniff`, and a `Permissions-Policy` in
  `next.config.ts`

This is unusually clean for a solo-developer project at this stage.
