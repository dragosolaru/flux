# Flux — Multi-brand EV Management Platform

> Flux is an open-source multi-brand EV management platform by [DAO Lab](https://daolab.ai). Connect your electric vehicles — across brands — and monitor and control them from one clean dashboard, independent of any manufacturer's app.

**Current direction (post pivot, 2026-05-17):** mock-first, multi-brand. Every supported brand is implemented against a Tier-3 stateful simulator we control. Real OEM integrations come back brand-by-brand later, gated by a `LIVE_INTEGRATIONS` env flag. The original Tesla Fleet API code stays in the tree but is dormant until reactivated.

See `docs/SCOPE.md` for the product story and `docs/ARCHITECTURE.md` for the engineering rationale. The formal change record lives under `openspec/changes/pivot-mock-first-platform/`.

---

## What's mocked, what's not

| Surface                       | Status                                                                  |
| ----------------------------- | ----------------------------------------------------------------------- |
| Telemetry & commands          | Mock (Tier-3 stateful simulator per vehicle)                            |
| Brands supported              | Tesla, BMW, Polestar, Mercedes-EQ, VW-ID, Hyundai/Kia, Renault — all mock |
| Energy tariffs                | Mock (Tibber-/Octopus-/aWATTar-style)                                   |
| Charging-network availability | Mock (Ionity, Tesla SC, EnBW, Allego, Fastned)                          |
| Weather + range derating      | Mock                                                                    |
| Trip planning                 | Mock                                                                    |
| Auth (Google + email/pass)    | Real                                                                    |
| Database (Supabase)           | Real, with RLS                                                          |

Every mocked vehicle card carries a `MOCK` chip. When *every* vehicle on an account is mock, a slim "Demo mode" banner is shown app-wide. `/about-data` lists the live-vs-mock status per category and per vehicle.

---

## Tech stack

| Layer            | Choice                                       |
| ---------------- | -------------------------------------------- |
| Framework        | Next.js 16 (App Router) + TypeScript strict  |
| Auth             | Auth.js v5 (Google + Credentials)            |
| Database         | Supabase Postgres with Row Level Security    |
| State / fetching | TanStack Query v5 (30s polling)              |
| Validation       | Zod at every API boundary                    |
| UI               | shadcn/ui (hand-written) + Tailwind CSS v4   |
| Specs / changes  | OpenSpec under `openspec/`                   |
| Deploy           | Vercel (serverless)                          |

Read `node_modules/next/dist/docs/` before writing Next-specific code; this is Next 16, not the Next.js most training data covers.

---

## Getting started

### 1. Clone and install

```bash
git clone <repo-url> flux
cd flux
nvm use            # uses Node 22 (.nvmrc)
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:

| Variable                       | Where to get it                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`     | Supabase dashboard → Project settings → API                                                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Supabase dashboard → Project settings → API                                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`    | Same page, **service_role** key — server-side only                                                             |
| `NEXTAUTH_SECRET`              | `openssl rand -base64 32`                                                                                      |
| `NEXTAUTH_URL`                 | `http://localhost:3000` in dev                                                                                 |
| `GOOGLE_CLIENT_ID/SECRET`      | Google Cloud Console → Credentials                                                                             |
| `LIVE_INTEGRATIONS`            | Empty for the mock-first MVP. Comma-separated brand keys later (e.g. `tesla,bmw`).                             |
| `TESLA_*` (legacy)             | Only required when `LIVE_INTEGRATIONS` includes `tesla`. Otherwise harmless to leave empty.                    |
| `TESLA_TOKEN_ENCRYPTION_KEY`   | `openssl rand -hex 32` — same caveat as `TESLA_*` above.                                                       |

### 3. Set up Supabase

In the Supabase SQL editor, run the migrations in order from `supabase/migrations/`. Migration `002_mock_platform.sql` adds the mock simulator tables (`mock_vehicle_state`, `charging_sessions`, `trips`, vehicle table extensions).

### 4. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000.

---

## Architecture in one breath

- **Brand registry** (`src/lib/brands/`) maps each brand to a capability map + adapter + data source. UI components gate on capabilities — unsupported features hide entirely.
- **Tier-3 simulator** (`src/lib/mock/`) maintains a per-vehicle snapshot, advanced by a pure `tick(snapshot, now, brand)` function on every read. Commands mutate the snapshot atomically. Charging sessions and trips are derived from motion-state transitions.
- **Brand-dispatched API** at `/api/vehicles/:id/state` and `/api/vehicles/:id/commands` reads `vehicles.brand` + `vehicles.data_source` and routes to either the mock engine or a live brand adapter.
- **External-data layer** (`src/lib/external/`) mirrors the brand pattern for tariffs, charging networks, weather, and routing. All mock providers today.
- **Multi-vehicle UX**: `/garage` is the landing page with the grid + fleet totals; `/dashboard?v=<id>` is the deep card view; the top nav has a vehicle switcher.
- **Mock disclosure**: `MOCK` chip per card, global "Demo mode" banner when all-mock, transparency page at `/about-data`.

Full rationale in `docs/ARCHITECTURE.md`.

---

## Project structure (post-pivot)

```
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── garage/                 # ← default landing, fleet grid + aggregates
│   │   ├── dashboard/              # ← deep card, reads ?v=<id>
│   │   ├── energy/                 # ← tariffs + smart charging
│   │   ├── charging-map/           # ← charging-network discovery
│   │   ├── trip/                   # ← trip planning
│   │   └── settings/
│   ├── api/
│   │   ├── auth/
│   │   ├── vehicles/[id]/{state,commands}/   # ← brand-dispatched
│   │   ├── tesla/                  # legacy; 410 when tesla not in LIVE_INTEGRATIONS
│   │   └── ...
│   ├── about-data/                 # ← mock-vs-live transparency
│   └── ...
├── components/
│   ├── disclosure/                 # MockChip, MockGlobalBanner
│   ├── vehicle/                    # capability-gated
│   └── ...
├── lib/
│   ├── brands/                     # registry + per-brand profiles & adapters
│   ├── mock/                       # Tier-3 simulator: engine, scenarios, persistence
│   ├── external/                   # tariffs, charging-networks, weather, routing
│   ├── tesla/                      # legacy real integration (dormant)
│   ├── supabase/
│   └── api-fetch.ts
└── types/
supabase/migrations/{001_initial,002_mock_platform}.sql
docs/{SCOPE,ARCHITECTURE,CHANGELOG,NEXT-STEPS,BRANDS,SIMULATOR}.md
openspec/{project.md, changes/pivot-mock-first-platform/}
tesla-proxy/                        # dormant; will be revived when live Tesla returns
```

---

## OpenSpec workflow

This codebase uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for change proposals and capability specs.

```bash
openspec list                                   # active changes
openspec show pivot-mock-first-platform         # current pivot
openspec validate pivot-mock-first-platform --strict
openspec status pivot-mock-first-platform       # implementation progress
```

Slash commands in Claude Code:

- `/opsx:propose` — start a new change
- `/opsx:explore` — think-partner mode
- `/opsx:apply` — implement tasks from an approved change
- `/opsx:archive` — move a completed change to `openspec/changes/archive/`

---

## Built by DAO Lab

DAO Lab is an AI consulting company that ships production-grade software, faster. We work with founders and teams to design, build, and operate AI-augmented products.

Flux is our first public portfolio project — a live demonstration of the engineering quality and AI-augmented workflow we bring to client projects. The code is open, the architecture is deliberate, and every decision is documented in `docs/ARCHITECTURE.md` and `openspec/`.

If you'd like to work with us, reach out at hello@daolab.ai.
