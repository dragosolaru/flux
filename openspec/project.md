# Flux — Project Conventions for OpenSpec

This file gives OpenSpec proposals a stable reference for *how Flux is built*, so change proposals can stay focused on *what changes* rather than re-explaining the stack each time.

## Product

Flux is a multi-brand EV management web app by DAO Lab. It demonstrates AI-augmented engineering as an open portfolio piece. See `docs/SCOPE.md` for vision and roadmap.

**Current direction (post 2026-05-17 pivot):** mock-first, multi-brand. Every supported brand is implemented against a Tier-3 stateful simulator; the real Tesla integration code stays in the tree behind a feature flag and will be re-activated brand-by-brand once each brand's full feature surface is mocked, validated, and locked.

## Stack

| Layer            | Choice                                       |
| ---------------- | -------------------------------------------- |
| Framework        | Next.js 16 (App Router) + TypeScript strict  |
| Auth             | Auth.js v5 (Google + Credentials)            |
| Database         | Supabase Postgres with Row Level Security    |
| State / fetching | TanStack Query v5 (30s polling)              |
| Validation       | Zod at every API boundary                    |
| UI               | shadcn/ui (hand-written) + Tailwind CSS v4   |
| Deploy           | Vercel (serverless)                          |

Read `node_modules/next/dist/docs/` before writing Next-specific code; this is Next 16, not the Next.js most training data covers.

## Conventions

### Boundaries are typed
No `any`, no `@ts-ignore`. Every API route validates input with Zod before reaching business logic. Every external response is mapped through a typed adapter into the internal `VehicleState` shape.

### Centralized data access
- Internal HTTP: `apiFetch` helper in `src/lib/api-fetch.ts`.
- Per-brand vehicle data: `src/lib/brands/<brand>/api.ts`, dispatched by the brand registry.
- External (tariffs, charging networks, weather, routing): `src/lib/external/<provider>/`.

Components never construct URLs and never know about transport details.

### Brand-pluggable
The brand registry (`src/lib/brands/registry.ts`) maps each supported brand to:
- A **capability map** (what telemetry fields, what commands)
- A **data source** (`mock` | `live`)
- An **adapter** that normalizes raw API responses into `VehicleState`

UI components read the capability map of the *current* vehicle and gate themselves accordingly. Cards, buttons, and stats hide entirely when the brand doesn't support them — they are never rendered as disabled.

### Sensitive data
- OAuth tokens (when real integrations come back online): AES-256-GCM at rest, encryption key in env only.
- Row-Level Security on every Supabase table.
- Server-only secrets. The browser never sees a token, a service-role key, or a brand client secret.

### Mock disclosure
The product is honest about which data is simulated:
- Each vehicle card shows a `MOCK` chip when its data source is the simulator.
- A global banner appears only when *every* vehicle on the current account is mocked.
- Tooltips explain what "MOCK" means in plain language.

## Repository

```
flux/
├── src/
│   ├── app/                 # Next.js App Router (auth + dashboard + api)
│   ├── components/          # shadcn/ui primitives + feature components
│   ├── hooks/               # TanStack Query wrappers
│   ├── lib/
│   │   ├── brands/          # ← post-pivot: registry + per-brand adapters
│   │   ├── external/        # ← post-pivot: tariffs, networks, weather, routing
│   │   ├── mock/            # ← post-pivot: Tier 3 simulator engine + scenarios
│   │   ├── supabase/
│   │   └── tesla/           # legacy real integration, kept behind flag
│   └── types/
├── supabase/migrations/
├── docs/                    # SCOPE, ARCHITECTURE, CHANGELOG, NEXT-STEPS
└── openspec/                # change proposals + capability specs
```

## OpenSpec workflow

1. Capture a direction with `/opsx:propose` (or by hand in `openspec/changes/<change-name>/`).
2. Implement tasks with `/opsx:apply`.
3. Archive completed changes with `/opsx:archive`.

Specs that have been approved live under `openspec/specs/<capability>/spec.md`. Change proposals propose deltas to those specs in `openspec/changes/<change-name>/specs/<capability>/spec.md`.
