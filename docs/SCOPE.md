# SCOPE — Flux by DAO Lab

## Product

**Flux** is a multi-brand EV management web application built by DAO Lab. It is an **open portfolio project** intended to demonstrate AI-augmented engineering and modern full-stack architecture in a real, deployable product.

After the pivot on 2026-05-17 (see `docs/CHANGELOG.md` and `openspec/changes/pivot-mock-first-platform/`), Flux is **mock-first**: every brand is implemented against a Tier-3 stateful simulator we control. The real Tesla integration code stays in the tree behind a feature flag (`LIVE_INTEGRATIONS`). Real OEM APIs will be re-activated brand by brand once each brand's full UI surface is mocked, validated, and locked.

## Vision

> Democratize EV management across brands in one unified app — independent of the manufacturer's app.

Drivers shouldn't need a separate app per brand, with inconsistent UX and feature gaps. Flux gives EV owners more control, more insight, and more flexibility than any single OEM app provides — and crucially, it gives **multi-EV households one place** to see and manage every car together. Long-term, Flux is the layer that lets households or small businesses run multi-brand EV fleets without juggling logins.

## Target users

EV owners who want **more** than the stock manufacturer app gives them:

- Tesla owners who want a faster, cleaner dashboard with command shortcuts.
- **Multi-brand households** (the new primary persona) who run, say, a Tesla + a BMW + a Polestar and refuse to keep three apps open.
- Tech-leaning drivers who care about charging-tariff optimization and history.
- Future: small businesses operating 2–10 EV fleets across brands.

## MVP scope (this codebase, post-pivot)

The MVP is a mock-first multi-brand platform with the ambition of being **more capable than any single OEM app**.

Phases 1–6 are implemented. Phases 7–14 are in progress (see `docs/NEXT-STEPS.md`).

### Phase 1–6: implemented

- **7 supported brands**, mock-only: Tesla, BMW, Polestar, Mercedes-EQ, Volkswagen-ID, Hyundai/Kia, Renault.
  - Brand registry at `src/lib/brands/` with `BrandProfile`, `BrandCapabilities`, and per-brand `profile.ts` files.
  - `BrandCapabilities` covers 31 telemetry fields, 18 commands, history retention, and refresh model.
  - `BRAND_MODELS` in `models.ts` holds real WLTP figures for 17 models across 7 brands.
- **VehicleState superset**: `src/types/vehicle.ts` is a brand-agnostic superset of all OEM data fields. Fields unsupported by a brand are `null`.
- **Capability-driven UI**: every telemetry card and command button is gated on `caps.telemetry.*` / `caps.commands.*`. Unsupported features hide entirely — never disabled.
- **`useBrandCapabilities(brand)` hook** for components.
- **`LIVE_INTEGRATIONS` env flag**: empty by default (everything mock). Comma-separated brand keys activate live adapters brand by brand.
- **Tier-3 stateful simulator** (`src/lib/mock/`):
  - Pure `tick(snapshot, now, brand)` with scenario-step-aligned chunk physics.
  - `applyCommand(snapshot, command, args, brand)` with capability gate (throws on unsupported commands).
  - 4 scenarios: `commuter` (24h), `road-trip` (48h), `weekend-errands` (24h), `vacation` (96h).
  - `CYCLE_ANCHOR_MS = 2026-01-01T00:00:00Z` for deterministic wall-clock progression.
  - Session boundary detection: charging sessions and trips derived from `motionState` transitions.
  - Persistence in `mock_vehicle_state`; history in `charging_sessions`, `trips`, `command_events`.
  - `createInitialSnapshot` seeds correct per-model physics from WLTP specs.
- **Multi-vehicle per account**: garage grid as default landing, deep-card view at `/dashboard?v=<id>`, vehicle switcher in top bar.
- **Brand-dispatched API routes**: `GET /api/vehicles/:id/state`, `POST /api/vehicles/:id/commands`, `GET /api/vehicles`, `POST /api/vehicles`, `DELETE /api/vehicles/:id`.
- **Extended telemetry UI**: TPMS (4 tires), doors (4 + trunk + frunk), windows, sentry/dashcam, software card, battery health (SoH), cell voltages — all gated on brand capability.
- **Energy tariffs** (`src/lib/external/tariffs/`): mock Tibber, Octopus, aWATTar providers. `/energy` page with 24h price curve, cheapest-window highlight, smart-charge recommendation.
- **Database migrations**: `001_initial.sql`, `002_mock_platform.sql` (mock tables + RLS), `003_mock_vehicle_spec.sql`, `004_user_settings.sql`.
- Google OAuth + email/password sign-in.
- Dark mode first, light mode supported.
- Row-Level Security on every Supabase table.
- AES-256-GCM encryption at rest for any OAuth tokens that exist (Tesla legacy + future live integrations).

### Planned (Phases 7–14)

- **Charging-network discovery** (Ionity, Tesla SC, EnBW, Allego, Fastned) → interactive map, real-time stall availability, plug-compatibility filter.
- **Weather + range derating** → realistic km-range based on temperature, wind, precipitation.
- **Trip planning** → routes with optimal charging stops, multi-vehicle ETA comparison.
- **Aggregate / cross-vehicle features**: fleet totals, smart-charge coordinator, "Which car should I take?" recommender, grid CO₂ intensity tracker.
- **Mock disclosure UX**: `MOCK` chip per card, global "Demo mode" banner, `/about-data` transparency page.
- **Legacy preservation**: `LIVE_INTEGRATIONS` flag plumbing fully wired; Tesla live paths gated.
- **Documentation** (Phase 13 — current).
- **Validation + demo**: demo user with 3 mock cars, Playwright happy-path, README GIFs.

## Non-goals for MVP

- Re-activating live Tesla OAuth (deferred until full mock surface is locked).
- Re-activating any other OEM live integrations.
- Native mobile apps.
- Fleet management (multi-driver, role-based access).
- Monetization, paywalls, subscription tiers.
- Push notifications.

## Future roadmap

| Phase | Theme                              | Highlights                                                                                       |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0.2   | Re-activate Tesla live             | Wire `LIVE_INTEGRATIONS=tesla`, re-run vehicle-command-proxy on Fly.io, hybrid mock+live accounts |
| 0.3   | BMW + Polestar live                | First non-Tesla live adapters built against the now-locked capability contract                   |
| 0.4   | Mercedes / VW / Hyundai / Renault  | Continue brand coverage live                                                                     |
| 0.5   | Real tariff providers              | Tibber + Octopus real APIs replace mocks                                                         |
| 0.6   | Real charging-network data         | OpenChargeMap + Ionity / Fastned real APIs                                                       |
| 0.7   | iOS / Android widgets              | Read-only widget: battery + range, via web push or wrapper app                                   |
| 0.8   | Trip routing real                  | Replace mock router with ABRP-grade real planner                                                 |
| 1.0   | Monetization                       | Freemium tier (1 vehicle, basic dashboard) + Pro at €4.99/month (multi-vehicle, smart charging)  |

## DAO Lab context

Flux is the first public product under the **DAO Lab** umbrella. DAO Lab is an AI consulting company helping founders and teams design, build, and operate AI-augmented products.

This codebase serves a dual purpose:

1. **A real product** that we (and hopefully others) actually use.
2. **A live portfolio piece** that demonstrates the engineering quality DAO Lab brings to client projects — strict typing, schema validation at boundaries, encrypted sensitive data, RLS by default, capability-driven UI architecture, and a Tier-3 stateful simulator written with the same care as a production integration.

Every architectural decision in this repo is documented in `docs/ARCHITECTURE.md`. The intent is for prospective clients to be able to read the code, the scope, and the architecture, and form a precise opinion about what working with DAO Lab looks like.
