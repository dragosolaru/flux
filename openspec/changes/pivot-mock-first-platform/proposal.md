# Pivot: mock-first, multi-brand EV platform

## Why

The original MVP shipped a Tesla-only, single-vehicle dashboard backed by the real Tesla Fleet API. That validated the end-to-end stack (Auth.js + Supabase + Fleet API + Vercel) but it also made every product decision hostage to one OEM's coverage, rate limits, and command-protocol constraints (the unresolved Vehicle Command Protocol blocker is documented in `docs/NEXT-STEPS.md`).

Three things changed:

1. **Product direction.** Flux's promise — *"one app for every EV, more capable than any OEM app"* — is the multi-brand story. We need to look credible on day one with a multi-brand UI, not in roadmap phase 0.4.
2. **Demo + portfolio leverage.** Flux is a DAO Lab portfolio piece. A dashboard that shows three live cars across three brands beats one real Tesla that can't even honk.
3. **Engineering decoupling.** Building against a stateful simulator we control lets us design the brand abstraction *before* committing to any single OEM's API shape. When we later wire up the real Tesla / BMW / Polestar API, we already know the schema we want to map into.

So we pivot. Every brand becomes a mock backed by a Tier-3 stateful simulator. The real Tesla integration code stays in the tree behind a feature flag — we'll switch it back on, brand by brand, once each brand's full UI surface is mocked, validated, and locked.

## What Changes

### Foundations
- **Brand registry** with per-brand capability maps and data-source flag (`mock` | `live`). Adapter pattern with one entry per supported brand. UI components gate themselves on capabilities; unsupported features hide entirely.
- **Extended `VehicleState` superset** covering all 11 OEM telemetry categories (energy, drive, climate, body, security, software, efficiency, trips, charging history, subscriptions, safety). Fields are nullable; brands populate only what they support.
- **Multi-vehicle per account** — lift the one-vehicle constraint at the DB and UI layer. Garage grid as the new landing, deep card view on `/dashboard?v=<id>`, vehicle switcher in the sidebar.

### Stateful simulator
- **Tier 3 `MockVehicleEngine`** — per-vehicle state machine with a deterministic clock. Battery drains while driving, charges while plugged in, climate consumes kWh, commands actually mutate state, history accumulates in real time.
- **Scenario player** — pre-built scripted scenarios (`commuter`, `road-trip`, `weekend-errands`, `vacation`) that the simulator plays back on a schedule, so an idle car still has plausible state when the user opens the app.
- **Mock persistence** — per-vehicle state stored in Supabase (`mock_vehicle_state` table), advanced by tick on each read.

### Brands (7 EU heavyweights)
Mock implementations of: **Tesla**, **BMW**, **Polestar**, **Mercedes-EQ**, **Volkswagen-ID**, **Hyundai/Kia**, **Renault**. Each brand has a distinct capability profile to validate the capability-driven UI:

| Brand     | Telemetry richness | Commands richness        |
| --------- | ------------------ | ------------------------ |
| Tesla     | Max                | Max (incl. sentry, honk) |
| BMW       | High               | Mid (no honk/flash)      |
| Polestar  | Mid                | Low (climate only)       |
| Mercedes  | High               | Mid                      |
| VW-ID     | Mid                | Mid                      |
| Hyundai   | Mid                | Mid (incl. charge ctrl)  |
| Renault   | Low-mid            | Low                      |

### Beyond-OEM data sources
- **Energy tariffs**: Tibber-/Octopus-/aWATTar-style dynamic pricing, today's price curve, cheapest-window calculator, smart-charge recommendation.
- **Charging-network discovery**: mock registries for Ionity, Tesla Supercharger, EnBW, Allego, Fastned. Per-station stalls + live availability + per-network pricing.
- **Weather + range derating**: forecast + wind + temperature impact on real-world range.
- **Trip planning**: route with optimal charging stops, multi-vehicle ETA comparison.

### Aggregate / multi-vehicle features
- Fleet totals (combined range, monthly cost, energy used).
- Smart-charge coordinator across multiple plugged-in vehicles when tariff windows are tight.
- Cross-brand efficiency comparison.
- Grid CO₂ intensity tracker at charge time.
- "Which of my cars should I take?" recommendation based on SoC, plug status, and a destination.

### Mock disclosure
- `MOCK` chip on every simulated vehicle card; tooltip explains.
- Global banner only when *every* vehicle on the account is mock.
- `/about-data` page documenting what's simulated and what isn't.

### Legacy preservation
- Real Tesla code paths (`src/lib/tesla/*`, `/api/tesla/*` OAuth, `tesla-proxy/`, `tesla_tokens` table) stay in the tree, gated behind a `LIVE_INTEGRATIONS` env flag. No deletions during the pivot.
- The current `Black Panther` real vehicle row in DB is migrated to brand `tesla` data-source `mock` so the demo still works during transition.

## Impact

- **Affected specs** (all new, this is greenfield for OpenSpec):
  - `vehicle-platform` (brand registry, capability system, extended telemetry types)
  - `mock-simulator` (Tier 3 engine, scenarios, persistence)
  - `fleet-management` (multi-vehicle, garage, switcher, aggregates)
  - `energy-tariffs`
  - `charging-network-discovery`
  - `weather-and-range`
  - `trip-planning`
  - `mock-disclosure`

- **Affected code**:
  - `src/types/vehicle.ts` — superset rewrite, additive only
  - `src/lib/brands/` (new) — registry + per-brand adapters
  - `src/lib/mock/` (new) — simulator engine, scenarios, persistence
  - `src/lib/external/` (new) — tariffs, networks, weather, routing providers
  - `src/lib/tesla/` — unchanged in body; called only when `LIVE_INTEGRATIONS` includes `tesla`
  - `src/app/api/vehicles/[id]/...` (new) — brand-dispatched vehicle + command routes; replaces direct `/api/tesla/vehicle`
  - `src/app/(dashboard)/garage/` (new), `src/app/(dashboard)/dashboard/` (refactored to read `?v=<id>`)
  - `src/app/(dashboard)/energy/`, `/charging-map/`, `/trip/` (new pages)
  - `src/components/vehicle/*` — capability-gated rendering
  - `src/components/disclosure/*` (new) — mock chip + banner
  - Supabase migration 002: extend `vehicles` table, add `mock_vehicle_state`, lift unique constraint, add `charging_sessions` materialized table

- **Affected docs**: `README.md`, `docs/SCOPE.md`, `docs/ARCHITECTURE.md`, `docs/NEXT-STEPS.md`, `docs/CHANGELOG.md` all updated to reflect the pivot.

- **Out of scope for this change**:
  - Re-activating live Tesla integration (deferred until full mock surface is locked).
  - Native mobile apps.
  - Monetization tiers.
  - Real provider integrations for tariffs / networks / weather / routing (all mocked).
