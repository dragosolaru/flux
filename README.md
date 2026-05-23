# Flux — EV Management Platform (Tesla MVP)

> Flux is an EV management platform by [DAO Lab](https://daolab.ai). Currently focused on Tesla, with infrastructure designed for multi-brand expansion via Cloudmailin-style live integrations.

**Direction (2026-05-23):** Tesla-only MVP. The platform runs against a Tier-3 stateful mock simulator by default (`data_source=mock`). Real Tesla Fleet API integration is wired but dormant, activated per-vehicle when `LIVE_INTEGRATIONS=tesla` and OAuth pairing completes. Other brands (BMW, Polestar, Mercedes-EQ, VW, Hyundai/Kia, Renault) are archived on the `demo-brands-archive` branch and can be re-introduced when expanding.

See `docs/LIVE-VS-DEMO.md` for the live/demo separation strategy, `docs/ARCHITECTURE.md` for engineering rationale, `docs/SYSTEMS.md` for infrastructure setup, and `docs/COST-INTELLIGENCE.md` for the AI document parsing system.

---

## What it is

Flux gives Tesla owners control and insight beyond the first-party app — and lets multi-EV households manage every car in one place. The simulator is not toy state: battery drains on driving physics, charges with real AC/DC rate calculations, climate costs kWh, and commands mutate persistent state. Charging sessions and trips accumulate from motion-state transitions so History pages show real (simulated) data.

Beyond OEM telemetry, Flux includes:
- **Cost Intelligence** — Claude Vision parses uploaded or emailed energy bills and charger receipts. Attributes home-bill costs proportionally using charging history; links public receipts to the nearest charging session.
- **Tariff providers** — mock Tibber/Octopus/aWATTar with 24h price curves and smart-charge windows.
- **Charging-map** — mock charging-network discovery.

---

## Brand support

| Brand | Models (mock) | Live integration |
|---|---|---|
| Tesla | Model 3, Model Y, Model S, Model X | Available — Fleet API + Virtual Key (gated by `LIVE_INTEGRATIONS=tesla`) |

Other brands (BMW, Polestar, Mercedes-EQ, VW, Hyundai/Kia, Renault) have full mock implementations on the `demo-brands-archive` branch. Cherry-pick from there to re-enable.

---

## Live vs Demo

Every vehicle has `data_source = "mock" | "live"`:

- **Mock** (default): runs against the deterministic simulator. Safe for any account, no OEM credentials needed.
- **Live** (Tesla, opt-in): requires `LIVE_INTEGRATIONS=tesla` env var + OAuth pairing via `/api/tesla/connect`. Real data, real commands sent to your car.

See `docs/LIVE-VS-DEMO.md` for the full strategy.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict |
| Auth | Auth.js v5 (Google OAuth + Credentials) |
| Database | Supabase Postgres with Row Level Security |
| State / fetching | TanStack Query v5 |
| Validation | Zod at every API boundary |
| UI | shadcn/ui (hand-written) + Tailwind CSS v4 |
| Simulator | `src/lib/mock/` — pure tick engine + scenario JSON |
| Brand registry | `src/lib/brands/` — Tesla profile + capability map |
| Live Tesla | `src/lib/tesla/` — Fleet API client, AES-256-GCM token encryption (dormant) |
| AI parsing | Claude Vision (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Email ingest | Cloudmailin webhook → `POST /api/documents/inbound-email` |
| Deploy | Vercel (serverless) |

> This is Next.js **16**, not 15. Read `node_modules/next/dist/docs/` before writing Next-specific code.

---

## Running locally

```bash
git clone <repo-url> flux
cd flux
nvm use          # Node 22 (.nvmrc)
npm install
cp .env.local.example .env.local
# fill in env vars (see table below)
npm run dev
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
| `LIVE_INTEGRATIONS` | No | Leave empty for mock-only. `tesla` to enable live Tesla |
| `TESLA_CLIENT_ID` / `TESLA_CLIENT_SECRET` | If live | Tesla Developer dashboard |
| `TESLA_TOKEN_ENCRYPTION_KEY` | If live | `openssl rand -hex 32` — used for AES-256-GCM token encryption |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for document parsing |
| `EMAIL_WEBHOOK_SECRET` | Yes | Shared secret for Cloudmailin inbound webhook |
| `NEXT_PUBLIC_CLOUDMAILIN_ADDRESS` | Yes | e.g. `abc123@cloudmailin.net` |

Run Supabase migrations in `supabase/migrations/` in order via the SQL editor.

---

## Project structure

```
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── garage/                  # default landing — fleet grid + aggregates
│   │   ├── dashboard/               # deep card view (?v=<vehicleId>)
│   │   ├── costs/                   # Cost Intelligence dashboard
│   │   ├── energy/                  # tariffs + smart charging
│   │   ├── charging-map/            # charging-network discovery
│   │   ├── trip/                    # trip planning
│   │   └── settings/
│   ├── api/
│   │   ├── vehicles/[id]/
│   │   │   ├── state/               # brand-dispatched GET
│   │   │   └── commands/            # capability-checked POST
│   │   ├── documents/               # Cost Intelligence: upload, inbound-email, recover
│   │   ├── costs/                   # cost aggregation
│   │   └── tesla/                   # live Tesla OAuth + commands (gated)
│   └── about-data/                  # mock-vs-live transparency
├── components/
│   ├── disclosure/                  # MockChip, MockGlobalBanner
│   └── vehicle/                     # capability-gated cards and panels
├── lib/
│   ├── brands/                      # registry (Tesla only), types, profile
│   ├── mock/                        # Tier-3 simulator: engine, scenarios, persistence, seed
│   ├── external/                    # tariffs, charging-networks, weather, routing, BNR
│   ├── tesla/                       # live integration: api, auth, tokens, constants
│   ├── ai/                          # Claude Vision document parser
│   ├── costs/                       # attribution math, session matcher, processor
│   └── supabase/
├── data/
│   └── scenarios/                   # commuter.json, road-trip.json, weekend-errands.json, vacation.json
└── types/
supabase/migrations/
docs/
tesla-proxy/                         # dormant; revived when live Tesla returns
```

---

## Built by DAO Lab

DAO Lab is an AI consulting company that ships production-grade software. Flux is our portfolio project — a live demonstration of the engineering quality and AI-augmented workflow we bring to client projects. Contact: hello@daolab.ai.
