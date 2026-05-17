# mock-simulator

## ADDED Requirements

### Requirement: Stateful per-vehicle mock snapshots with deterministic tick

The system SHALL maintain per-vehicle stateful mock data with deterministic tick advancement. Each mock vehicle SHALL have a persistent snapshot in the `mock_vehicle_state` table, advanced by a pure `tick(snapshot, now, brand) → snapshot` function that consumes elapsed time since `last_tick_at` and updates battery level, location, odometer, climate, and motion state accordingly.

#### Scenario: state advances on read
- **WHEN** the dispatcher serves `GET /api/vehicles/<id>/state` for a mock vehicle
- **AND** `last_tick_at` is 60s in the past and `motionState === "driving"`
- **THEN** the simulator MUST advance battery, odometer, and location proportionally
- **AND** MUST persist the new snapshot before responding

#### Scenario: tick is deterministic
- **WHEN** `tick(s, t, brand)` is called twice with the same inputs
- **THEN** both invocations MUST produce identical outputs

### Requirement: Atomic command application against the snapshot

The system SHALL apply commands by mutating the snapshot atomically. Command handlers SHALL call `applyCommand(snapshot, command, args, brand) → snapshot` which MUST validate against brand capabilities and apply the mutation. Lock, climate, charge limit, and charging start/stop SHALL change observable state immediately.

#### Scenario: unlock command mutates state
- **WHEN** `POST /api/vehicles/<id>/commands` with `{ command: "door_unlock" }` succeeds for a mock vehicle
- **THEN** the next `GET /api/vehicles/<id>/state` MUST return `isLocked: false`

#### Scenario: capability-rejected command leaves state unchanged
- **WHEN** `applyCommand` receives `honk_horn` for a brand with no honk capability
- **THEN** the function MUST return the snapshot unchanged
- **AND** the API MUST respond `400 command-not-supported`

### Requirement: Scripted scenarios for realistic daily routines

The system SHALL play scripted scenarios that progress the vehicle through realistic daily routines. A scenario SHALL be a JSON file describing an ordered list of steps (timestamps, motion-state transitions, waypoints, climate events). The engine SHALL advance `scenarioStep` over time and synthesize state changes accordingly. Initial scenarios MUST include: `commuter`, `road-trip`, `weekend-errands`, `vacation`.

#### Scenario: scenario advances over wall-clock time
- **WHEN** a vehicle is on the `commuter` scenario and the wall clock crosses 09:00
- **THEN** the scenario step MUST advance to "depart for work"
- **AND** the next tick MUST transition `motionState` from `parked` to `driving`

### Requirement: Charging session and trip detection

The system SHALL detect and persist charging sessions and trips derived from simulator state. Consecutive `motionState === "charging"` ticks SHALL aggregate into a single `charging_sessions` row (location, network, kWh added, cost, duration). Consecutive `motionState === "driving"` ticks SHALL aggregate into a single `trips` row.

#### Scenario: charging session closed on plug-out
- **WHEN** a vehicle transitions from `charging` to `parked` or `plugged-idle`
- **THEN** the open `charging_sessions` row MUST be closed with `ended_at`, `end_soc`, `energy_added_kwh`, `cost_eur`

#### Scenario: trip closed on stop
- **WHEN** a vehicle transitions from `driving` to `parked`
- **THEN** the open `trips` row MUST be closed with `ended_at`, `distance_km`, `energy_used_kwh`, `avg_speed_kmh`, `max_speed_kmh`

### Requirement: Simulator state persisted under RLS

The system SHALL persist simulator state via Supabase with Row-Level Security enforced. `mock_vehicle_state`, `charging_sessions`, and `trips` SHALL be RLS-protected by `user_id` derived through the parent `vehicles` row. Server routes SHALL read/write via the service-role client only after verifying the Auth.js session.

#### Scenario: cross-user mock state access denied
- **WHEN** user A's `GET /api/vehicles/<id>/state` references a vehicle owned by user B
- **THEN** the API MUST respond `404 not-found`
