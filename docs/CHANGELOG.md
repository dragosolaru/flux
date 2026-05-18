# Changelog

All notable changes to Flux are documented here.
Format: [Version] — Date · Description

## [Unreleased]

### 2026-05-18 — Phase 13: documentation

- Added `docs/BRANDS.md` — per-brand capability matrix table covering all 31 telemetry fields, 18 commands, history settings, and model specs (WLTP figures) for all 7 brands. Sourced directly from `src/lib/brands/*/profile.ts` and `src/lib/brands/models.ts`.
- Added `docs/SIMULATOR.md` — complete Tier-3 engine guide: `tick()` algorithm, `applyCommand()` capability gate, physics per motion state (driving drain, charging gain, climate drain), CYCLE_ANCHOR time model, scenario JSON format with full field reference, session boundary detection, seed process, and scenario authoring guide.
- Rewrote `README.md` to reflect mock-first multi-brand platform: what it is, 7 supported brands with models, key features, tech stack, local setup steps, env var table, project structure.
- Expanded `docs/ARCHITECTURE.md` with: brand registry pattern (file layout, BrandProfile shape, API dispatcher flow), VehicleState superset + capability mask, full Tier-3 simulator section (tick algorithm, applyChunk physics per state, applyCommand, scenario system, CYCLE_ANCHOR, session boundary detection), database schema overview for all 4 mock tables, tariff provider abstraction, multi-vehicle UX routes.
- Updated `docs/SCOPE.md` MVP section to reflect completed phases 1–6.
- Replaced `docs/NEXT-STEPS.md` with remaining phases 7–14 from the OpenSpec task list.

### 2026-05-17 — Pivot to mock-first multi-brand platform

- Direction change: Flux abandons "Tesla-only, real API" as the MVP shape and adopts a **mock-first, multi-brand** posture. Every brand is implemented against a Tier-3 stateful simulator; live integrations come back brand-by-brand later, gated by the `LIVE_INTEGRATIONS` env flag.
- Scaffolded OpenSpec (`openspec/`) with the formal change proposal `pivot-mock-first-platform`, including proposal, design, tasks, and 8 capability spec deltas (vehicle-platform, mock-simulator, fleet-management, energy-tariffs, charging-network-discovery, weather-and-range, trip-planning, mock-disclosure). The change passes `openspec validate --strict`.
- Documented the new direction in `docs/SCOPE.md`, `docs/NEXT-STEPS.md`, `docs/ARCHITECTURE.md`, and `README.md`. Tesla HTTP Proxy plan in the previous `NEXT-STEPS.md` is paused (not deleted; the `tesla-proxy/` scaffold stays in the tree).
- 7 supported brands targeted (Tesla, BMW, Polestar, Mercedes-EQ, VW-ID, Hyundai/Kia, Renault), chosen for EU market share and to validate the capability-driven UI across distinct capability profiles.
- Beyond-OEM data layers planned and specced (mocked): energy tariffs, charging-network discovery, weather + range derating, trip planning.

### 2026-05-16 — Live Tesla integration (now superseded by mock-first)

- Provisioned the live environment end-to-end: Supabase project + migration,
  Google OAuth credentials, Tesla developer app, Vercel deployment on
  `flux-alpha-three.vercel.app`.
- Registered Flux as a Tesla EU partner (`partner_accounts` POST) and exposed
  the EC P-256 command-signing public key at
  `/.well-known/appspecific/com.tesla.3p.public-key.pem` via a route handler.
- Virtual Key paired with the first user's vehicle (Model 3, 2023).
- Defensive parsing of `vehicle_data` so partially-asleep cars don't crash the
  dashboard; auto wake-on-408 with one retry.
- `/api/tesla/command` returns `412 VCP_REQUIRED` for cars that require Tesla's
  Vehicle Command Protocol. UI surfaces a dedicated toast and a dismissible
  banner explaining the limitation.
- Scaffolded `tesla-proxy/` (Dockerfile + fly.toml + entrypoint) for the
  upcoming Tesla HTTP Proxy deployment on Fly.io. Flux already routes commands
  through `TESLA_PROXY_BASE_URL` when set; otherwise falls back to Tesla
  direct (legacy REST, works for pre-2021 cars).
- Documented the next-session plan in `docs/NEXT-STEPS.md`.

## [0.1.0] — 2026-05-16 · Initial scaffold

- Project initialized: **Flux by DAO Lab**
- Next.js 16 (App Router) + TypeScript strict, Tailwind CSS v4
- Auth.js v5 — Google OAuth + email/password (Credentials provider backed by Supabase)
- Supabase Postgres schema: `profiles`, `vehicles`, `tesla_tokens`, `vehicle_snapshots` with Row Level Security
- Tesla Fleet API integration: OAuth 2.0 + PKCE, multi-region probe (EU / NA / CN), encrypted-at-rest tokens (AES-256-GCM), in-place refresh
- Dashboard page: live vehicle card with SVG battery gauge, stats grid (range, odometer, climate), quick commands (lock, climate, horn, flash)
- Charging page: live status card, charge-limit slider, scheduled-charging stub, recent-session history
- Settings page: account info, vehicle disconnect, danger-zone account deletion
- shadcn/ui primitives (hand-written: button, card, input, label, skeleton, slider, switch, separator, avatar, sonner)
- TanStack Query v5 with 30s polling on vehicle state and mutation-triggered invalidation
- `next-themes` for dark/light mode toggle (dark-first)
- Documentation: SCOPE, ARCHITECTURE (with implementation decisions), README
