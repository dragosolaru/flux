# Design — Pivot to mock-first multi-brand platform

This document captures the non-obvious technical decisions behind the pivot. Each section answers a specific question someone would ask during code review.

## 1. Why a brand registry instead of inheritance / a base class?

A brand is not a *kind of vehicle*. A brand is a **policy** about which fields and commands exist, plus a thin adapter function. Inheritance forces the wrong shape (you would inherit unused fields). A registry is data:

```ts
// src/lib/brands/registry.ts
export const BRANDS = {
  tesla:    teslaProfile,
  bmw:      bmwProfile,
  polestar: polestarProfile,
  mercedes: mercedesProfile,
  vw:       vwProfile,
  hyundai:  hyundaiProfile,
  renault:  renaultProfile,
} as const

export type BrandKey = keyof typeof BRANDS

export interface BrandProfile {
  key: BrandKey
  displayName: string
  capabilities: BrandCapabilities
  dataSource: "mock" | "live"
  adapter: BrandAdapter
}
```

`BrandCapabilities` is a deeply nested boolean map (telemetry.* and commands.*) plus a few enums (refresh model, history retention). The component layer reads `capabilities[currentBrand]` and gates rendering. Adapters are pure functions: `(raw) => Partial<VehicleState>`. We can swap mock for live by changing `dataSource` and the adapter's underlying fetch.

**Rejected alternatives**:
- *Class hierarchy*: heavy, hostile to tree-shaking, awkward for capability gating from JSX.
- *Per-brand React contexts*: leaks brand awareness into the UI tree; defeats the brand-blind component contract.

## 2. Why `VehicleState` is a *superset* with nullable fields, not a union of brand-specific types?

Two reasons:

1. **The UI is one component tree.** A `<BatteryCard>` should not need to know which brand it is rendering. It reads `state.batteryLevel`; if `null`, it renders nothing (or a "no data" placeholder for required fields). Brand-specific union types would force pattern-matching in every component.
2. **Forward compatibility.** When BMW exposes a new field next year (e.g. cell voltage), we widen the superset and the BMW adapter populates it. Components that gate on `capabilities.telemetry.cellVoltages` automatically light up. No breaking type change.

The cost is a slightly noisier type (many nullable fields). Acceptable because nullability is *semantically meaningful* — `null` is "this brand doesn't tell us" and the UI honors that distinction.

## 3. Why a stateful simulator (Tier 3) and not a script (Tier 2) or fixture (Tier 1)?

The product hypothesis is "more capable than any OEM app." That collapses if our demo is a frozen snapshot or a 4-line script that loops. Tier 3 unlocks:

- **Commands that actually do something**: pressing "Unlock" mutates `state.isLocked`; pressing "Climate on" actually drains battery; pressing "Set charge limit" changes the time-to-full.
- **History that accrues**: charging sessions get longer the longer you leave the simulator running. Trip log grows. Efficiency metrics shift.
- **Capability validation**: the simulator is forced to obey the brand capability map. If we wire a "Honk" command for a brand that says `commands.honk: false`, the dispatcher rejects it. The capability system gets exercised end-to-end.
- **Scenarios as data**: a `commuter.scenario.json` describes a daily routine. The engine plays it back. Adding "vacation in Italy with 3 chargers" is a JSON change, not code.

**Engine shape**:

```ts
// src/lib/mock/engine.ts
interface MockVehicleSnapshot {
  state: VehicleState
  motionState: "parked" | "driving" | "charging" | "plugged-idle"
  scenarioId: string | null
  scenarioStep: number
  lastTickAt: string  // ISO
}

function tick(snapshot: MockVehicleSnapshot, now: Date, brand: BrandProfile): MockVehicleSnapshot
```

Tick is **pure**: given a snapshot + clock, produce the next snapshot. Persistence lives in Supabase (`mock_vehicle_state`). On `GET /api/vehicles/:id/state`, the handler loads the row, ticks to `now`, persists, returns. No background worker required for the v1; we accept a small cold-tick latency for simplicity.

**Rejected alternative**: background tick worker. Adds Fly.io / cron deployment surface for a benefit (always-fresh state without a triggering read) that the dashboard polling at 30s already provides.

## 4. How does the dispatcher know which brand to call?

`vehicles.brand` column on the DB. On every request to `/api/vehicles/:id/state` or `/api/vehicles/:id/commands`:

```
1. Auth (Auth.js session)
2. Load vehicle row from Supabase, verify userId match
3. Look up brand profile in registry
4. If dataSource === "mock": call mock engine
   If dataSource === "live": call brand adapter against real API
5. Apply adapter, return VehicleState
```

The decision point is row-data, not env-data. That lets a single account have a mix of mock and live vehicles when live integrations come back.

## 5. Why keep the legacy Tesla code in the tree?

Deleting working code is irreversible. The Tesla OAuth + PKCE + region probe + token refresh + AES-256-GCM encryption is ~500 lines of validated, working integration. Re-deriving it costs days. Cost of keeping it: an env flag check and an unused import path. Trivial.

**Flag**: `LIVE_INTEGRATIONS` — comma-separated brand keys (`tesla,bmw,...`). Each brand's profile reads its key from `process.env.LIVE_INTEGRATIONS?.split(",")`. If included, `dataSource` for that brand becomes selectable per-vehicle. If not, the brand is mock-only.

## 6. Database changes (migration 002)

```sql
-- Lift one-vehicle-per-user constraint (was app-level only, but add safety)
-- Vehicle table additions for new fields
ALTER TABLE vehicles
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'mock' CHECK (data_source IN ('mock','live')),
  ADD COLUMN model TEXT,
  ADD COLUMN year INT,
  ADD COLUMN trim TEXT,
  ADD COLUMN color TEXT,
  ADD COLUMN photo_url TEXT,
  ADD COLUMN nickname TEXT;

-- Per-vehicle mock state (one row per vehicle, replaces vehicle_snapshots for mock)
CREATE TABLE mock_vehicle_state (
  vehicle_id UUID PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  state JSONB NOT NULL,            -- full VehicleState
  motion_state TEXT NOT NULL,       -- parked | driving | charging | plugged-idle
  scenario_id TEXT,
  scenario_step INT DEFAULT 0,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Materialized charging sessions for history
CREATE TABLE charging_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  energy_added_kwh NUMERIC(8,2),
  start_soc INT,
  end_soc INT,
  network TEXT,         -- ionity | tesla-sc | enbw | allego | fastned | home
  cost_eur NUMERIC(8,2),
  location_lat NUMERIC(9,6),
  location_lng NUMERIC(9,6)
);

-- Trips
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  start_lat NUMERIC(9,6), start_lng NUMERIC(9,6),
  end_lat NUMERIC(9,6),   end_lng NUMERIC(9,6),
  distance_km NUMERIC(8,2),
  energy_used_kwh NUMERIC(8,2),
  avg_speed_kmh NUMERIC(6,2),
  max_speed_kmh NUMERIC(6,2)
);

-- RLS on all new tables (mirror existing pattern)
```

The existing `vehicle_snapshots` table is **kept but deprecated** for mock vehicles (the simulator writes directly to `mock_vehicle_state`). For future live vehicles, snapshots remain the polling history.

## 7. Capability-driven UI in practice

Component pattern:

```tsx
function VehicleCommandPanel({ vehicle, state }: Props) {
  const caps = useBrandCapabilities(vehicle.brand)

  return (
    <div className="grid grid-cols-2 gap-2">
      {caps.commands.lock     && <LockButton  vehicle={vehicle} locked={state.isLocked} />}
      {caps.commands.climate  && <ClimateBtn  vehicle={vehicle} on={state.isClimateOn} />}
      {caps.commands.honk     && <HonkButton  vehicle={vehicle} />}
      {caps.commands.flash    && <FlashButton vehicle={vehicle} />}
      {caps.commands.charge   && <ChargeBtn   vehicle={vehicle} state={state} />}
    </div>
  )
}
```

The same pattern applies to `StatsGrid`, the detail panels, even page-level nav (a brand without trip history doesn't show a "Trips" tab). The garage page renders only fields *all* visible brands support; per-card detail shows everything the brand allows.

## 8. External data abstraction

Tariffs, charging networks, weather, and routing follow the **same** registry pattern as brands:

```ts
// src/lib/external/tariffs/registry.ts
export const TARIFF_PROVIDERS = {
  tibber:    tibberMockProvider,
  octopus:   octopusMockProvider,
  awattar:   awattarMockProvider,
} as const
```

A user picks a tariff provider in settings (or none). The dashboard reads the active provider to render price curves and smart-charge recommendations. Same shape as brands; when we plug real APIs, only the provider's underlying fetch changes.

## 9. Mock disclosure UX rules

Three states, three treatments:

| Scenario                                | Treatment                                                 |
| --------------------------------------- | --------------------------------------------------------- |
| Vehicle dataSource = `mock`             | `MOCK` chip in card header (amber), tooltip on hover      |
| All vehicles on account are `mock`      | Slim banner on top of dashboard: "You are in Demo mode."  |
| Any vehicle is `live`                   | No global banner. Per-card chips only.                    |

The `/about-data` page is linked from the tooltip and the banner; it lists which data categories on the dashboard are simulated and which are live, per vehicle.

## 10. Why not delete the Tesla OAuth pages right now?

`docs/SCOPE.md` is now mock-first, but real Tesla connection is still on the roadmap (re-activation phase). The OAuth pages stay routed (`/connect/tesla`, `/api/tesla/*`) but only render / function when `LIVE_INTEGRATIONS` includes `tesla`. In the default config (no live integrations), the "Add real Tesla" CTA in onboarding is hidden, and the only way to add a vehicle is the brand picker that creates a mock.
