@AGENTS.md

# Flux — Codebase Context for AI Agents

## Stack

- **Next.js 16** (App Router, `after()` for background tasks) — read `node_modules/next/dist/docs/` before writing route code
- **TypeScript strict** — no `any`, use `unknown` + type guards
- **Supabase** — Postgres + auth + storage. Admin client: `createSupabaseAdminClient()`. Never expose service role key to client.
- **next-intl v4** — `useTranslations("namespace")` in client components, `getTranslations` in server. All UI strings must be i18n'd. Locales: `en`, `ro`, `de`, `fr`, `hu` in `src/lib/i18n/locales/`.
- **TanStack Query v5** — `useQuery`/`useMutation`. Vehicle state: `queryKey: ["vehicle-state", vehicleId]`, staleTime 30s.
- **NextAuth** — session via `auth()` server-side, `useSession()` client-side.

## Key Architecture Rules

### Security — NEVER skip these

1. **Every API route** must call `auth()` and check `session?.user?.id` before touching data.
2. **Every DB query** on user-owned data must include `.eq("user_id", session.user.id)`.
3. **`getValidAccessToken(vehicleId, userId)`** — always pass `userId`; it enforces ownership inside.
4. **callbackUrl redirects** — always validate `startsWith("/")` before `router.replace()`.
5. **Webhook secrets** — header-only (`x-webhook-secret`), never query params. Fail closed if not configured.
6. **Rate limits** — use `checkRateLimit(userId, bucket, max)` from `src/lib/rate-limit.ts`.

### Brand capability system

- Every telemetry field and command is gated via `BrandCapabilities` in `src/lib/brands/types.ts`.
- Adding a new command requires changes in: `CommandName` (history.ts), `CommandCapabilities` (brands/types.ts), `COMMAND_CAP_MAP` (brands/command-map.ts), `TESLA_COMMAND_MAP` (brands/tesla/command-map.ts), `TeslaCommand` (types/tesla.ts), tesla profile, mock engine switch case.
- UI gates: `<FeatureGate capability="COMMANDS">` for command features.

### i18n rules

- All visible strings → `useTranslations("namespace")` in client components.
- Add keys to ALL 5 locale files simultaneously: `en.json`, `ro.json`, `de.json`, `fr.json`, `hu.json`.
- Namespace structure mirrors component hierarchy.

### Vehicle data flow

```
useVehicle(vehicleId)
  → GET /api/vehicles/[vehicleId]/state
    → Tesla live: fetchVehicleData(vehicleId, userId, teslaVehicleId, displayName)
      → getValidAccessToken(vehicleId, userId)  ← ownership check inside
    → Mock: tick(snapshot) + saveSnapshot
```

### Command flow

```
useVehicleCommand().mutate({ vehicleId, command, args })
  → POST /api/vehicles/[vehicleId]/commands
    → UUID validate + rate limit + ownership check
    → Live: TESLA_COMMAND_MAP[command] → sendVehicleCommand(vehicleId, userId, …)
    → Mock: applyCommand(snapshot, command, …)
```

## Env Vars (required for production)

| Var | Purpose |
|-----|---------|
| `TESLA_TOKEN_ENCRYPTION_KEY` | 64 hex chars (32 bytes) — AES-256-GCM key |
| `TESLA_CLIENT_ID` | Tesla Fleet API OAuth client |
| `TESLA_CLIENT_SECRET` | Tesla Fleet API secret |
| `NEXTAUTH_SECRET` | NextAuth session + HMAC state signing |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB access (server only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EMAIL_WEBHOOK_SECRET` | Cloudmailin inbound webhook secret |
| `TIBBER_TOKEN` | Optional: real Tibber API token |
| `OPENAI_API_KEY` | Optional: alternative OCR provider |
| `ANTHROPIC_API_KEY` | OCR document extraction |

## File Map

```
src/
  app/
    (dashboard)/          # Auth-gated dashboard pages
      dashboard/          # Main vehicle dashboard
      charging/           # Charging sessions + smart charge
      costs/              # Cost analytics
      energy/             # Tariff + smart charge energy page
      settings/           # User settings
    api/
      auth/               # NextAuth + register + Tesla OAuth
      documents/          # Upload + email webhook + OCR
      vehicles/[id]/      # state, commands, charging-history
      costs/              # Cost aggregation + export
      user/               # GDPR export + delete
  components/
    vehicle/              # Dashboard cards (BatteryHealthCard, DepartureCard, …)
    charging/             # ChargingStatus
    energy/               # SmartChargeCard
    layout/               # FeatureGate, nav, sidebar
  hooks/
    useVehicle.ts         # Vehicle state + polling
    useVehicleCommand.ts  # Command dispatch mutation
    useBrandCapabilities.ts
  lib/
    auth.ts               # NextAuth config
    brands/               # Capability model + command maps
    tesla/                # tokens.ts, api.ts, charging-history.ts
    mock/                 # Simulator engine + persistence
    costs/                # OCR processor + attribution
    external/tariffs/     # Tibber + mock tariff providers
    rate-limit.ts         # In-memory sliding window limiter
    supabase/             # Client + admin + ensure-user
  types/
    vehicle.ts            # VehicleState
    history.ts            # CommandName, ChargingSession
    tesla.ts              # TeslaCommand union
```

## Active TODOs (as of 2026-05-25)

### Blockers
- **Tesla VCP proxy** — post-2021 cars need `tesla-http-proxy` Go binary deployed + `TESLA_PROXY_BASE_URL` set
- **E2E tests** — no Playwright suite; any regression goes undetected
- **`virtual_key_paired` flag** — never set to true; commands remain gated even after VCP proxy

### High priority
- **WhatsApp OCR ingest** — Twilio webhook → same `processDocument` pipeline
- **Smart charge auto-coordinator** — stagger recommendations for multi-EV homes
- **In-app notifications** — push when charging completes or cheap window opens

### Medium priority
- **Upstash Redis rate limiter** — replace in-memory Map (not shared across Vercel instances)
- **Trip planner real routing** — OSRM or GraphHopper instead of Haversine
- **Charging map** — OpenChargeMap API (300k+ POIs) instead of hardcoded ~50 stations
- **Tesla token revocation detection** — clean up on `invalid_grant` from refresh
- **Key rotation tooling** for `TESLA_TOKEN_ENCRYPTION_KEY`

See `docs/TODO.md` for the full list.
