# Flux — Mock-First Multi-Brand EV Management Platform

> Flux is an open-source multi-brand EV management platform by [DAO Lab](https://daolab.ai). Monitor and control electric vehicles across 7 brands from one dashboard — independent of any manufacturer's app.

**Direction (post-pivot, 2026-05-17):** mock-first, multi-brand. Every supported brand runs against a Tier-3 stateful simulator. Real OEM integrations return brand-by-brand, gated by `LIVE_INTEGRATIONS`. The original Tesla Fleet API code stays in-tree but dormant.

See `docs/ARCHITECTURE.md` for engineering rationale, `docs/SYSTEMS.md` for infrastructure setup, and `docs/COST-INTELLIGENCE.md` for the AI document parsing system.

---

## What it is

Flux gives EV owners more control and insight than any single OEM app — and lets multi-EV households manage every car in one place. The platform is brand-blind by design: capability maps decide which cards and buttons render per vehicle, so the same codebase handles a feature-rich Tesla and a minimal Renault without branches.

The simulator is not toy state. Battery drains on driving physics, charges with real AC/DC rate calculations, climate costs kWh, and commands mutate persistent state. Charging sessions and trips accumulate automatically from motion-state transitions, so History pages show real (simulated) data, not fixtures.

Beyond OEM telemetry, Flux mocks energy tariff providers (Tibber, Octopus, aWATTar), charging-network discovery (Ionity, Tesla SC, EnBW, Allego, Fastned), weather with range derating, and trip planning with charging-stop insertion.

---

## Brands supported

| Brand | Models (mock) | Tier |
|---|---|---|
| Tesla | Model 3, Model Y, Model S | Full telemetry + all commands |
| BMW | i4 eDrive35, i4 M50, iX xDrive40, iX M60 | High telemetry, mid commands |
| Polestar | Polestar 2, Polestar 3 | Mid telemetry, climate-only commands |
| Mercedes-EQ | EQE 300, EQE 43 AMG, EQS 450+ | High telemetry, mid commands |
| Volkswagen ID | ID.3, ID.4, ID.7 | Mid telemetry, mid commands |
| Hyundai / Kia | Ioniq 5, Ioniq 6, EV6, EV9 | Mid telemetry, charge-control commands |
| Renault | Megane E-Tech, Scenic E-Tech | Low-mid telemetry, minimal commands |

See `docs/BRANDS.md` for the per-brand capability matrix.

---

## Key features

- **Tier-3 stateful simulator** — deterministic `tick(snapshot, now, brand)` advances per-vehicle state on every read. No background worker required.
- **Capability masking** — UI components gate on `caps.telemetry.*` / `caps.commands.*`, never on brand identity. Unsupported features hide entirely, not disabled.
- **Scenario player** — 4 scripted scenarios (`commuter`, `road-trip`, `weekend-errands`, `vacation`) make idle accounts look alive. Scenarios cycle on a fixed anchor (`2026-01-01T00:00:00Z`).
- **History tracking** — charging sessions and trips derived from motion-state transitions, stored in `charging_sessions` and `trips` tables with real calculated values.
- **Cost Intelligence** — Claude Vision parses uploaded or emailed energy bills and charger receipts. Extracts kWh, cost, provider; converts currencies via BNR; attributes home-bill costs proportionally using charging history; links public receipts to the nearest charging session.
- **Tariff providers** — mock Tibber/Octopus/aWATTar with 24h price curves, cheapest-window highlight, smart-charge recommendations.
- **Multi-vehicle UX** — `/garage` as default landing with fleet totals; `/dashboard?v=<id>` for deep card view; vehicle switcher in top nav.
- **Mock disclosure** — `MOCK` chip per card, global "Demo mode" banner when all-mock, `/about-data` transparency page.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict |
| Auth | Auth.js v5 (Google OAuth + Credentials) |
| Database | Supabase Postgres with Row Level Security |
| State / fetching | TanStack Query v5 (30s polling) |
| Validation | Zod at every API boundary |
| UI | shadcn/ui (hand-written) + Tailwind CSS v4 |
| Simulator | `src/lib/mock/` — pure tick engine + scenario JSON |
| Brand registry | `src/lib/brands/` — profiles + capability maps |
| AI parsing | Claude Vision (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Email ingest | Cloudmailin webhook → `POST /api/documents/inbound-email` |
| Deploy | Vercel (serverless) |

> This is Next.js **16**, not 15. Read `node_modules/next/dist/docs/` before writing Next-specific code. APIs, conventions, and file structure differ from earlier versions.

---

## Running locally

### 1. Clone and install

```bash
git clone <repo-url> flux
cd flux
nvm use          # Node 22 (.nvmrc)
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase dashboard → Project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Same page, anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same page, service_role key — server-side only |
| `NEXTAUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | `http://localhost:3000` in dev |
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | Yes | Same |
| `LIVE_INTEGRATIONS` | No | Leave empty for mock-first MVP. Comma-separated brand keys to enable live: `tesla,bmw` |
| `TESLA_*` | No | Only needed when `LIVE_INTEGRATIONS` includes `tesla` |
| `TESLA_TOKEN_ENCRYPTION_KEY` | No | `openssl rand -hex 32` — same caveat |

### 3. Run Supabase migrations

In the Supabase SQL editor, run in order:

```
supabase/migrations/001_initial.sql
supabase/migrations/002_mock_platform.sql
supabase/migrations/003_mock_vehicle_spec.sql
supabase/migrations/004_user_settings.sql
```

Migration 002 adds `mock_vehicle_state`, `charging_sessions`, `trips`, and `command_events` with RLS policies.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in, add a vehicle (any brand), pick a scenario, and the simulator runs.

---

## Project structure

```
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── garage/                  # default landing — fleet grid + aggregates
│   │   ├── dashboard/               # deep card view (?v=<vehicleId>)
│   │   ├── energy/                  # tariffs + smart charging
│   │   ├── charging-map/            # charging-network discovery
│   │   ├── trip/                    # trip planning
│   │   └── settings/
│   ├── api/
│   │   ├── vehicles/[id]/
│   │   │   ├── state/               # brand-dispatched GET
│   │   │   └── commands/            # brand-dispatched POST, capability-checked
│   │   └── tesla/                   # legacy; 410 Gone when not in LIVE_INTEGRATIONS
│   └── about-data/                  # mock-vs-live transparency
├── components/
│   ├── disclosure/                  # MockChip, MockGlobalBanner
│   └── vehicle/                     # capability-gated cards and panels
├── lib/
│   ├── brands/                      # registry, types, per-brand profiles
│   ├── mock/                        # Tier-3 simulator: engine, scenarios, persistence, seed
│   ├── external/                    # tariffs, charging-networks, weather, routing
│   ├── tesla/                       # legacy live integration (dormant)
│   └── supabase/
├── data/
│   └── scenarios/                   # commuter.json, road-trip.json, weekend-errands.json, vacation.json
└── types/
supabase/migrations/
docs/
openspec/
tesla-proxy/                         # dormant; revived when live Tesla returns
```

---

## OpenSpec workflow

```bash
openspec list
openspec show pivot-mock-first-platform
openspec validate pivot-mock-first-platform --strict
openspec status pivot-mock-first-platform
```

Slash commands in Claude Code: `/opsx:propose`, `/opsx:explore`, `/opsx:apply`, `/opsx:archive`.

---

## Built by DAO Lab

DAO Lab is an AI consulting company that ships production-grade software, faster. Flux is our first public portfolio project — a live demonstration of the engineering quality and AI-augmented workflow we bring to client projects.

The code is open, the architecture is documented in `docs/ARCHITECTURE.md`, and every design decision is explained. If you'd like to work with us: hello@daolab.ai.
