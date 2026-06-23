# Flux — Codebase Context

> **Token-saving convention:** this file is the single source of architectural truth.
> CLAUDE.md and AGENTS.md stay short (rules only). Agents read this when they need details.
> Detailed docs live in `docs/` — see the index at the bottom.

---

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 16** App Router | `after()` for background tasks. Read `node_modules/next/dist/docs/` before writing route code. |
| Language | **TypeScript strict** | No `any`. Use `unknown` + type guards. |
| Auth | **NextAuth v5** | `auth()` server-side, `useSession()` client. Session has `user.id` (NextAuth UUID). |
| Database | **Supabase** (Postgres) | Admin client: `createSupabaseAdminClient()`. Never expose service role key to client. |
| Storage | **Supabase Storage** | `documents` bucket. Path: `{userId}/{vehicleId}/{uuid}.{ext}`. |
| State | **TanStack Query v5** | Vehicle state: `queryKey: ["vehicle-state", vehicleId]`, `staleTime: 30_000`. |
| i18n | **next-intl v4** | Locales: `en`, `ro`, `de`, `fr`, `hu` in `src/lib/i18n/locales/`. |
| Styling | **Tailwind CSS v4** + shadcn/ui | Theme via CSS variables; `dark:` variants via next-themes. |
| AI/OCR | **Anthropic Claude** | `ANTHROPIC_API_KEY`. Document extraction in `src/lib/ai/`. |

---

## File Map

```
src/
  app/
    (dashboard)/              # Auth-gated layout
      dashboard/              # Main vehicle dashboard (DashboardClient)
      charging/               # Charging sessions + sync
      costs/                  # CostDashboard — monthly trend, kpi cards
      energy/                 # Tariff page + SmartChargeCard
      garage/                 # Fleet management — add/deactivate vehicles
      map/                    # Unified map — explore chargers or plan trips (bottom sheet)
      trip/                   # Standalone trip planner (legacy of map split)
      charging-map/           # Charging station map — filter by power/connector
      commands/               # Remote vehicle control (lock/unlock/climate/honk)
      about-data/             # Data transparency — live vs demo per data type
      settings/               # Locale, currency, home location, danger zone
    api/
      auth/                   # NextAuth [...nextauth] + /register + /tesla/callback
      documents/              # POST /upload, POST /inbound-email (Cloudmailin)
      vehicles/[vehicleId]/   # GET /state, POST /commands, POST /charging-history
      costs/                  # GET (aggregation), GET /export (CSV)
      user/                   # GET /export (GDPR), DELETE (account deletion)
      tesla/                  # /callback, /refresh, /vehicle, /command
  components/
    vehicle/                  # BatteryHealthCard, CommandPanel, DepartureCard,
                              # DoorsWindowsCard, ScoresCard, SentryDashcamCard,
                              # SoftwareCard, StatsGrid, TirePressureCard,
                              # VehicleCard, VehicleModelImage, WeatherRangeCard
    charging/                 # ChargingStatus
    energy/                   # SmartChargeCard, PriceCurveChart
    costs/                    # CostDashboard, IngestCard
    auth/                     # LoginForm
    layout/                   # FeatureGate, Sidebar, TopBar, BottomNav
  hooks/
    useVehicle.ts             # Vehicle state query + polling
    useVehicleCommand.ts      # Command dispatch mutation (useMutation)
    useBrandCapabilities.ts   # Brand caps from registry
    useVehicles.ts            # Vehicle list
  lib/
    auth.ts                   # NextAuth config
    rate-limit.ts             # In-memory sliding window (replace with Upstash for scale)
    brands/
      types.ts                # BrandCapabilities, CommandCapabilities, TelemetryCapabilities
      registry.ts             # getBrand(key) → BrandProfile
      command-map.ts          # COMMAND_CAP_MAP: CommandName → CommandCapabilities key
      adapter-utils.ts        # applyCapabilityMask
      tesla/
        profile.ts            # Tesla BrandProfile (all capabilities)
        command-map.ts        # TESLA_COMMAND_MAP: CommandName → TeslaCommand + buildBody
    tesla/
      tokens.ts               # encryptToken, decryptToken, getValidAccessToken(id, userId)
      api.ts                  # fetchVehicleData, sendVehicleCommand, fetchVehicleList
      auth.ts                 # refreshTeslaTokens, PKCE helpers
      charging-history.ts     # fetchTeslaChargingHistory
    mock/
      engine.ts               # tick(), applyCommand() — pure functions
      persistence.ts          # loadSnapshot, saveSnapshot, recordCommandEvent
      seed.ts                 # createInitialSnapshot per scenario
    costs/
      processor.ts            # processDocument (OCR → DB)
      attribution.ts          # home bill EV attribution
    external/tariffs/
      types.ts                # TariffForecast, TariffPrice, TariffProvider interface
      recommend.ts            # computeSmartCharge()
      providers/
        tibber.ts             # Real Tibber GraphQL (TIBBER_TOKEN)
        tibber-mock.ts        # Fake price curve
        octopus-mock.ts
        awattar-mock.ts
        electrica-ro.ts / eon-ro.ts / enel-ro.ts / hidroelectrica.ts
    supabase/
      server.ts               # createSupabaseAdminClient()
      client.ts               # createSupabaseBrowserClient()
      ensure-user.ts          # ensureSupabaseUserId — bridges NextAuth ↔ auth.users
    i18n/
      config.ts               # locales: ["en","ro","de","fr","hu"]
      locales/                # en.json, ro.json, de.json, fr.json, hu.json
  types/
    vehicle.ts                # VehicleState (single source of truth)
    history.ts                # CommandName, ChargingSession, CommandEvent
    tesla.ts                  # TeslaCommand union, TeslaVehicleDataResponse
    auth.ts                   # Extended NextAuth session types
```

---

## Key Data Flows

### Vehicle state (dashboard polling)

```
useVehicle(vehicleId)                        every 30s
  → GET /api/vehicles/[vehicleId]/state
    → auth() + checkRateLimit(userId, "state", 120)
    → vehicles.eq("user_id", userId)         ownership
    → if live: fetchVehicleData(id, userId, teslaId, name)
        → getValidAccessToken(id, userId)    ownership again (defense-in-depth)
        → Tesla /vehicle_data
    → if mock: tick(snapshot) → saveSnapshot
    → applyCapabilityMask(state, telemetry)
```

### Command dispatch

```
useVehicleCommand().mutate({ vehicleId, command, args })
  → POST /api/vehicles/[vehicleId]/commands
    → UUID validate + checkRateLimit + auth + ownership
    → capability check via COMMAND_CAP_MAP
    → if live: TESLA_COMMAND_MAP[command].buildBody → sendVehicleCommand(id, userId, …)
    → if mock: applyCommand(snapshot, command, args, profile)
```

### Document ingest (email)

```
Cloudmailin → POST /api/documents/inbound-email
  → x-webhook-secret header check (fail-closed)
  → resolveVehicle(): subaddress → sender email → nickname (scoped to resolved user)
  → storage.upload(path)
  → documents.insert(…)
  → after(): processDocument(docId)   ← background, doesn't block response
```

### Auth bridge (Supabase ↔ NextAuth)

NextAuth uses its own UUID for `session.user.id`. Supabase auth.users uses a different UUID. `ensureSupabaseUserId` in `src/lib/supabase/ensure-user.ts` maps between them — it verifies the NextAuth UUID exists in `auth.users` before returning it.

---

## Brand Capability System

Every feature is gated on `BrandCapabilities`. Never gate on brand identity directly.

```typescript
// FeatureGate component
<FeatureGate capability="COMMANDS" fallback="null">
  <CommandPanel … />
</FeatureGate>

// In API routes
if (!profile.capabilities.commands[COMMAND_CAP_MAP[command]]) {
  return 400; // command-not-supported
}
```

**Adding a new command — required changes (in order):**
1. `src/types/history.ts` — add to `CommandName` union
2. `src/lib/brands/types.ts` — add to `CommandCapabilities`
3. `src/lib/brands/command-map.ts` — add to `COMMAND_CAP_MAP`
4. `src/types/tesla.ts` — add to `TeslaCommand` union
5. `src/lib/brands/tesla/command-map.ts` — add to `TESLA_COMMAND_MAP` with `buildBody`
6. `src/lib/brands/tesla/profile.ts` — set capability to `true`
7. `src/lib/mock/engine.ts` — add `case` in `applyCommand` switch
8. All 5 locale files — if the command has UI strings

---

## Environment Variables

| Var | Required | Purpose |
|-----|----------|---------|
| `TESLA_TOKEN_ENCRYPTION_KEY` | ✅ | 64 hex chars (32 bytes) — AES-256-GCM |
| `TESLA_CLIENT_ID` | ✅ | Tesla Fleet API OAuth client |
| `TESLA_CLIENT_SECRET` | ✅ | Tesla Fleet API secret |
| `NEXTAUTH_SECRET` | ✅ | Session + HMAC state signing |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Admin DB (server only) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `EMAIL_WEBHOOK_SECRET` | ✅ | Cloudmailin webhook (fail-closed if absent) |
| `TIBBER_TOKEN` | optional | Real Tibber GraphQL prices |
| `ANTHROPIC_API_KEY` | optional | OCR — Anthropic Claude is the only provider (no OpenAI fallback). Without it, document OCR is disabled. |
| `TESLA_PROXY_BASE_URL` | optional | VCP proxy for post-2021 commands |
| `NEXT_PUBLIC_CLOUDMAILIN_ADDRESS` | optional | Email ingest address shown in UI |

---

## Active Blockers (as of 2026-06-23)

| # | Blocker | Notes |
|---|---------|-------|
| 1 | Tesla VCP proxy | Post-2021 cars: deploy `tesla-http-proxy` Go binary, set `TESLA_PROXY_BASE_URL` |
| 2 | `virtual_key_paired` flag | Never set to `true` — commands gated even after VCP proxy |

> E2E coverage exists: Playwright suite in `e2e/` (`npm run test:e2e`).

---

## Docs Index

| File | What's in it |
|------|-------------|
| `docs/FEATURES.md` | Master feature catalog — what each feature does, entry point, key files, deps |
| `docs/ARCHITECTURE.md` | Engineering decisions, DB schema rationale, module boundaries |
| `docs/SYSTEMS.md` | Every third-party service — Supabase, Tesla API, Cloudmailin, Anthropic |
| `docs/VEHICLE-CONNECTION.md` | Tesla OAuth PKCE flow, token lifecycle, VCP proxy setup |
| `docs/COST-INTELLIGENCE.md` | OCR pipeline, document attribution, cost aggregation |
| `docs/SIMULATOR.md` | Mock engine internals — tick logic, scenarios, snapshot schema |
| `docs/BRANDS.md` | Brand capability model, adding new brands |
| `docs/LIVE-VS-DEMO.md` | How live vs mock mode is switched per data type |
| `docs/SECURITY-AUDIT.md` | Audit findings + fixes, launch readiness checklist |
| `docs/INTEGRATIONS-CAR-ADMIN.md` | Car-admin integrations (RCA/ITP/rovinietă etc.) |
| `docs/USER-JOURNEY.md` | All user journeys, screen reference, feature gates, PWA install flow |
| `docs/DEPLOYMENT.md` | Vercel deployment (primary) |
| `docs/DEPLOYMENT-HETZNER.md` | Self-host alternative (Docker / standalone on Hetzner) |
| `docs/DESIGN-REVIEW.md` | Dated UI/UX design review snapshot |
| `docs/MARKETING.md` | Positioning, messaging, go-to-market |
| `docs/USER-RESEARCH-2026-06-11.md` | Dated user-research snapshot |
| `docs/ROADMAP.md` | Product vision, feature pipeline, prioritisation |
| `docs/TODO.md` | Detailed backlog with effort estimates |
| `docs/superpowers/specs/` | Dated design specs (historical record per feature) |
| `CHANGELOG.md` | Version history (repo root) |
