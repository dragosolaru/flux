# vehicle-platform

## ADDED Requirements

### Requirement: Brand registry as single source of truth

The system SHALL expose a brand registry that maps each supported brand to a profile, and UI components and API handlers SHALL depend on the registry rather than hard-coded brand checks.

Each `BrandProfile` SHALL expose:
- `key`: stable identifier (`tesla` | `bmw` | `polestar` | `mercedes` | `vw` | `hyundai` | `renault`)
- `displayName`: human-readable name
- `capabilities`: nested map of telemetry fields and commands the brand supports
- `dataSource`: `mock` | `live`
- `adapter`: pure function mapping raw API output to the internal `VehicleState`

#### Scenario: UI component checks brand capability before rendering
- **WHEN** the dashboard renders the command panel for a Polestar
- **AND** `BRANDS.polestar.capabilities.commands.honk === false`
- **THEN** the Honk button MUST NOT be present in the DOM

#### Scenario: unsupported brand rejected at dispatcher
- **WHEN** a request arrives for `vehicleId` whose `brand` is not a registry key
- **THEN** the API SHALL respond `400 unknown-brand`

### Requirement: Brand-agnostic `VehicleState` superset

The system SHALL provide an internal `VehicleState` type that is a superset covering all OEM telemetry categories. Fields a given brand does not provide SHALL be `null`, and UI components SHALL treat `null` as "no data" by hiding the field rather than substituting a placeholder value.

Telemetry categories covered: identity, energy/battery, drive/motion, climate/cabin, body/security, software/health, efficiency, trips, charging history, subscriptions, safety.

#### Scenario: brand-specific adapter populates only supported fields
- **WHEN** the BMW adapter maps a raw response to `VehicleState`
- **AND** the response has no cell-voltage data
- **THEN** `state.cellVoltages` MUST be `null`

#### Scenario: type system rejects unknown fields
- **WHEN** a brand adapter attempts to set a field not on the superset
- **THEN** TypeScript compilation MUST fail

### Requirement: Capability-driven UI gating

The system SHALL gate every UI feature on the active vehicle's brand capabilities. Components MUST hide unsupported features rather than render them disabled. This applies to telemetry cards, command buttons, navigation tabs, and detail panels.

#### Scenario: command button hidden when capability is false
- **WHEN** the active vehicle is a Renault with `capabilities.commands.flash === false`
- **THEN** the Flash Lights button MUST NOT be rendered

#### Scenario: navigation tab hidden when capability is absent
- **WHEN** the active vehicle's brand has `capabilities.historyRetention === "none"`
- **THEN** the "Trip history" tab MUST NOT appear in the sidebar for that vehicle

### Requirement: Brand-dispatched API layer

The system SHALL dispatch vehicle data and commands by brand at the API layer. `GET /api/vehicles/:id/state` and `POST /api/vehicles/:id/commands` SHALL look up the vehicle's brand and route to the corresponding adapter. The dispatcher SHALL honor the per-vehicle `dataSource` flag: `mock` calls the simulator, `live` calls the live brand adapter.

#### Scenario: mock vehicle state served by simulator
- **WHEN** `GET /api/vehicles/<id>/state` is called for a vehicle with `dataSource === "mock"`
- **THEN** the dispatcher MUST call the mock simulator and not any live brand adapter

#### Scenario: command rejected by brand capability
- **WHEN** `POST /api/vehicles/<id>/commands` requests `honk_horn` for a Polestar (no honk capability)
- **THEN** the API MUST respond `400 command-not-supported` without invoking the adapter

### Requirement: Opt-in live-integrations flag

The system SHALL support live integrations only when explicitly enabled via the `LIVE_INTEGRATIONS` environment variable, a comma-separated list of brand keys. When a brand is absent from the list, all vehicles of that brand SHALL be forced to `dataSource = "mock"` regardless of DB row state.

#### Scenario: live brand enabled
- **WHEN** `LIVE_INTEGRATIONS=tesla` is set
- **AND** a vehicle row has `brand=tesla, data_source=live`
- **THEN** the dispatcher MUST call the live Tesla adapter

#### Scenario: live brand disabled
- **WHEN** `LIVE_INTEGRATIONS` does not include `bmw`
- **AND** a vehicle row has `brand=bmw, data_source=live`
- **THEN** the dispatcher MUST override to mock and serve simulator data
