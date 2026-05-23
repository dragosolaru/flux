# SIMULATOR — Tier-3 Mock Engine

The Flux simulator is a deterministic, stateful engine that makes mock vehicles behave like real ones. Battery drains on driving physics, charges with accurate AC/DC rate math, climate costs kWh, commands mutate persistent state, and history tables fill automatically from motion-state transitions.

Source: `src/lib/mock/` — `engine.ts`, `scenarios.ts`, `persistence.ts`, `seed.ts`, `types.ts`.

---

## Architecture overview

```
GET /api/vehicles/:id/state
  └─ loadSnapshot(vehicleId)             → MockVehicleSnapshot from mock_vehicle_state
  └─ tick(snapshot, now, brand)          → next MockVehicleSnapshot (pure)
  └─ saveSnapshot(vehicleId, prev, next) → upsert mock_vehicle_state
                                           insert charging_sessions / trips if sessions closed
  └─ brand.adapter(next.state)           → Partial<VehicleState> (normalize output)
  └─ return VehicleState
```

No background worker. The 30s TanStack Query polling on the dashboard drives ticks. A vehicle that hasn't been viewed in a week will catch up on the next read — the simulator fast-forwards through all elapsed scenario steps.

---

## MockVehicleSnapshot

```ts
interface MockVehicleSnapshot {
  state: VehicleState;                        // full vehicle state object
  motionState: MotionState;                   // current motion state
  scenarioId: string | null;                  // active scenario
  lastTickAt: string;                         // ISO — last time tick() was called
  vehicleSpec: ScenarioVehicle | null;        // overrides scenario.vehicle defaults
  // Open session tracking (set on open, null on close)
  activeChargingSessionStart: string | null;
  activeChargingSessionNetwork: ChargingNetwork | null;
  activeChargingSessionStartSoc: number | null;
  activeTripStart: string | null;
  activeTripStartLat: number | null;
  activeTripStartLng: number | null;
  activeTripStartOdometerKm: number | null;
}
```

`vehicleSpec` comes from `models.ts` at seed time and contains real WLTP figures for the specific model (e.g., Tesla Model 3 uses 75 kWh / 16 kWh/100km; Model S uses 100 kWh / 20 kWh/100km). This overrides the scenario's built-in `vehicle` block so the same scenario produces accurate physics for different models.

---

## tick()

```ts
function tick(
  snapshot: MockVehicleSnapshot,
  now: Date,
  brand: BrandProfile,
): MockVehicleSnapshot
```

### Guarantees

- **Pure**: no `Date.now()`, no `Math.random()` outside explicit seeded RNG. Same inputs always produce the same output.
- **Deterministic replay**: calling `tick` with any past or future `now` produces the correct answer. No state is accumulated outside the snapshot.
- **Brand-safe**: `brand` is passed but currently only used at the adapter layer (the engine uses `vehicleSpec` from the snapshot). When brand-specific physics are needed, they can be added without changing the function signature.

### Algorithm

```
fromTime = new Date(snapshot.lastTickAt)
elapsedMs = now - fromTime
if elapsedMs ≤ 0: return snapshot unchanged

cursor = fromTime
prevMotion = snapshot.motionState

while cursor < now:
  { step, stepDuration, positionInStep } = getStepInfoAt(scenario, cursor)
  chunkSeconds = min(stepDuration - positionInStep, (now - cursor) / 1000)
  if chunkSeconds < 0.001: break

  if step.motionState ≠ prevMotion:
    snapshot = handleTransition(snapshot, prevMotion, step.motionState, cursor)
    prevMotion = step.motionState

  snapshot = applyChunk(snapshot, step, chunkSeconds, positionInStep, stepDuration, scenario)
  cursor += chunkSeconds * 1000ms

return { ...snapshot, lastTickAt: now.toISOString() }
```

The loop chunking ensures correct physics across scenario-step boundaries. If 2 hours elapsed and the vehicle drove 30 min then charged 90 min, each segment gets its own physics pass.

### applyChunk() — physics per motion state

**`driving`**

```
distKm    = avgSpeedKmh × (chunkSeconds / 3600)
drainKwh  = (distKm / 100) × efficiencyKwhPer100km
drainPct  = (drainKwh / batteryCapacityKwh) × 100
batteryLevel -= drainPct  (floor 0)
odometerKm += distKm
speedKmh = avgSpeedKmh
location = lerp(step.location → step.targetLocation, positionInStep + chunkSeconds / stepDuration)
```

If no `targetLocation` is defined, location stays at `step.location`.

**`charging`**

```
rate      = step.chargingRateKw ?? vehicleSpec.maxAcChargingRateKw
limit     = state.chargeLimit ?? 80

if batteryLevel < limit:
  gainKwh  = rate × (chunkSeconds / 3600)
  gainPct  = (gainKwh / batteryCapacityKwh) × 100
  batteryLevel = min(limit, batteryLevel + gainPct)
  chargingState = "charging"
  timeToFullMinutes = ceil((limit - batteryLevel) / 100 × batteryCapacityKwh / rate × 60)
else:
  chargingState = "complete"
  chargingRateKw = 0
```

**`plugged-idle`**

Same charging formula as `charging` when `batteryLevel < chargeLimit`. When at limit, `chargingRateKw = 0`, `chargingState = "complete"`.

**`parked`**

```
if state.isClimateOn:
  climateKw = 1.5
  drainKwh  = climateKw × (chunkSeconds / 3600)
  batteryLevel -= (drainKwh / batteryCapacityKwh) × 100  (floor 0)
```

No drain when climate is off and parked.

---

## applyCommand()

```ts
function applyCommand(
  snapshot: MockVehicleSnapshot,
  command: CommandName,
  args: Record<string, unknown> | null,
  brand: BrandProfile,
): MockVehicleSnapshot
```

Before mutating state, checks `brand.capabilities.commands[capKey]`. If false, throws:

```
Error("command-not-supported:<command>")
```

The route handler converts this to HTTP 422 `{ error: "command-not-supported", command }`.

State mutations by command:

| Command | Mutation |
|---|---|
| `lock` | `isLocked = true` |
| `unlock` | `isLocked = false` |
| `climate_on` | `isClimateOn = true` |
| `climate_off` | `isClimateOn = false` |
| `set_climate_temp` | `driverTempC = args.temp` |
| `set_charge_limit` | `chargeLimit = clamp(args.limitPct, 50, 100)` |
| `start_charging` | `chargingState = "charging"` |
| `stop_charging` | `chargingState = "stopped"` |
| `vent_windows` | `windowsOpen.frontLeft = windowsOpen.frontRight = true` |
| `close_windows` | All `windowsOpen.*` = false |
| `activate_sentry` | `isSentryMode = true` |
| `deactivate_sentry` | `isSentryMode = false` |
| `honk`, `flash`, `remote_start` | No state change (side-effect only) |
| `set_charge_amps`, `open/close_charge_port` | No-op in v1 |

---

## Scenario system

### CYCLE_ANCHOR

```ts
const CYCLE_ANCHOR_MS = new Date("2026-01-01T00:00:00Z").getTime();
```

All time is computed relative to this anchor. For any given `now`:

```
elapsedMs     = now.getTime() - CYCLE_ANCHOR_MS
cycleDurationMs = scenario.cycleDurationSeconds × 1000
cycleOffsetMs = ((elapsedMs % cycleDurationMs) + cycleDurationMs) % cycleDurationMs
cycleOffsetSec = cycleOffsetMs / 1000
```

The positive-modulo formula handles dates before the anchor correctly. `getStepInfoAt` then finds the step whose `startOffsetSeconds` is the largest value ≤ `cycleOffsetSec`.

Result: opening the app at 08:30 on any day will show the commuter vehicle at exactly the right point in its morning drive — without any per-user setup.

### Scenario JSON format

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "cycleDurationSeconds": 86400,
  "initialBatteryLevel": 75,
  "vehicle": {
    "batteryCapacityKwh": 75,
    "efficiencyKwhPer100km": 16,
    "maxAcChargingRateKw": 11,
    "maxDcChargingRateKw": 250
  },
  "steps": [ /* ScenarioStep[] */ ]
}
```

### ScenarioStep fields

| Field | Type | Required | Description |
|---|---|---|---|
| `startOffsetSeconds` | `number` | Yes | Seconds from cycle start when this step begins. Steps must be sorted ascending. |
| `motionState` | `"parked" \| "driving" \| "charging" \| "plugged-idle"` | Yes | Drives physics selection. |
| `location` | `{ lat: number; lng: number }` | Yes | Vehicle position at step start. |
| `targetLocation` | `{ lat: number; lng: number }` | No | Driving steps: position lerped toward this over step duration. |
| `avgSpeedKmh` | `number` | No | Driving only. Default: 80 km/h. |
| `chargingRateKw` | `number` | No | Charging/plugged-idle. Default: `vehicleSpec.maxAcChargingRateKw`. |
| `chargingNetwork` | `ChargingNetwork` | No | `"home"` \| `"ionity"` \| `"tesla-sc"` \| `"enbw"` \| `"allego"` \| `"fastned"` \| `"other"`. Stored on the charging session row. |
| `climateOn` | `boolean` | No | When omitted, climate state carries over unchanged from previous step. |
| `driverTempC` | `number` | No | Applied only when `climateOn = true`. |

The last step's duration is `cycleDurationSeconds - lastStep.startOffsetSeconds`. The cycle wraps immediately: step 0 follows the last step.

### Built-in scenarios

| ID | Cycle | Description |
|---|---|---|
| `commuter` | 24h | 9-to-5 commute in Prague. Home AC charge 00:00–07:00, morning drive 07:00–07:30, parked at office 07:30–17:00, evening drive 17:00–17:40, home plugged-idle 17:40–24:00. |
| `road-trip` | 48h | Frankfurt → Munich and back. Includes two DC fast-charge stops at Ionity (150 kW). |
| `weekend-errands` | 24h | Vienna Saturday: 4 short trips (supermarket, gym, lunch, home) with home plug overnight. |
| `vacation` | 96h (4 days) | Bucharest → Brașov → Sinaia → Bucharest with hotel AC charging (7.4 kW) each night. |

---

## Session boundary detection

`handleTransition` runs in `tick` when `step.motionState` changes between chunks. It opens and closes session fields on the snapshot:

```
from=driving, activeTripStart set        → clear activeTripStart (and lat/lng/odometer)
from=charging/plugged-idle, session set  → clear activeChargingSessionStart (and network/startSoc)

to=driving, no activeTripStart           → set activeTripStart, activeTripStartLat/Lng/OdometerKm
to=charging/plugged-idle, no session     → set activeChargingSessionStart, activeChargingSessionStartSoc
```

`saveSnapshot(vehicleId, prev, next)` in the persistence layer compares these fields:

- `prev.activeTripStart` set + `next.activeTripStart` null → `INSERT INTO trips`
- `prev.activeChargingSessionStart` set + `next.activeChargingSessionStart` null → `INSERT INTO charging_sessions`

Calculated on insert:

```
trips.distance_km     = next.odometerKm - prev.activeTripStartOdometerKm
trips.avg_speed_kmh   = (distance_km / durationSeconds) × 3600

charging_sessions.energy_added_kwh = (endSoc - startSoc) / 100 × batteryCapacityKwh (approx)
```

---

## Seed

When a vehicle is added via onboarding, `createInitialSnapshot(vehicleId, displayName, brand, scenarioId, modelName?)` creates the initial row:

1. Fetches the scenario.
2. Gets the model spec from `BRAND_MODELS[brand]` (or falls back to the first model for the brand).
3. Calls `getStepInfoAt(scenario, now)` to determine the current step.
4. Builds a `VehicleState` with `batteryLevel = scenario.initialBatteryLevel`, position at `step.location`, and brand-specific initial values (software version string, nominal tire pressures, etc.).
5. Sets `vehicleSpec` to the model's real WLTP figures.

The snapshot is immediately correct for "right now" — no boot period or blank state.

---

## Authoring a new scenario

1. Create `src/data/scenarios/<your-id>.json` following the format above.
2. Decide on `cycleDurationSeconds`. Common values: 86400 (1 day), 172800 (2 days), 345600 (4 days), 604800 (7 days).
3. Start with `startOffsetSeconds: 0` and add steps in ascending order. The last step's duration runs to `cycleDurationSeconds`.
4. For driving steps, always provide `targetLocation` so the vehicle moves on the map.
5. Use `chargingNetwork: "home"` for overnight AC charges; use a specific network (`"ionity"`, `"enbw"`, etc.) for DC fast charges. The network is stored on the `charging_sessions` row.
6. Register the scenario in `src/lib/mock/scenarios.ts`:

```ts
import yourScenarioJson from "@/data/scenarios/your-id.json";

const ALL_SCENARIOS: Scenario[] = [
  commuterJson as Scenario,
  roadTripJson as Scenario,
  weekendErrandsJson as Scenario,
  vacationJson as Scenario,
  yourScenarioJson as Scenario,   // ← add here
];
```

7. The scenario is immediately available in the onboarding model picker. No migration needed.

### Things to check before committing

- Steps are sorted by `startOffsetSeconds` ascending.
- No step has `startOffsetSeconds >= cycleDurationSeconds`.
- Every driving step has a `targetLocation` (otherwise the car teleports).
- Battery math makes sense: a 75 kWh car at 16 kWh/100km driving 100 km loses ~21%. Overnight AC at 7.4 kW for 8 hours adds ~79%. If you want the scenario to sustain itself, charge input ≥ drive drain across one full cycle.

---

## Testing

```bash
npm test -- src/lib/mock/__tests__/engine.test.ts
```

The test suite verifies:

- `tick` is deterministic: same inputs → same outputs.
- Battery drains and charges at the correct rates.
- Commands mutate the correct state fields.
- Unsupported commands throw `command-not-supported:<name>`.
- Scenario step boundaries are crossed cleanly.
- Session open/close fields transition correctly across motion-state changes.
