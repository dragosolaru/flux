# charging-network-discovery

## ADDED Requirements

### Requirement: Charging-network registry with per-station mock data

The system SHALL maintain a registry of charging networks with per-station mock data. Supported networks MUST include Ionity, Tesla Supercharger, EnBW, Allego, and Fastned. Each station SHALL carry ID, name, lat/lng, network key, stall count, plug types (CCS / CHAdeMO / Type 2), max kW per stall, and base price €/kWh.

#### Scenario: station registry contains EU coverage
- **WHEN** the system boots with the mock charging-network registry
- **THEN** the registry MUST include at least 50 stations spread across user-relevant EU countries

### Requirement: Stochastic stall availability

The system SHALL simulate live stall availability with stochastic transitions. Each station's per-stall availability MUST flicker on a Poisson process, transitioning among `available`, `occupied`, and `out-of-service` with brand-realistic mean times.

#### Scenario: availability changes over time
- **WHEN** the dispatcher queries station availability at T+0 and T+5min
- **THEN** the per-stall availability MAY differ between the two readings
- **AND** the transitions MUST be statistically consistent with the Poisson model

### Requirement: Interactive nearby-stations map

The system SHALL render an interactive map of nearby stations on `/charging-map`. The map MUST be centered on the active vehicle's location, pin stations within a configurable radius, and color-encode pins by availability percentage.

#### Scenario: clicking a pin opens detail
- **WHEN** the user clicks a station pin
- **THEN** a side panel MUST open with stall list, plug compatibility for the active vehicle, distance, ETA, and per-network price

### Requirement: Nearest compatible plug card

The system SHALL surface a "nearest compatible plug" card per vehicle on the Dashboard. The card MUST show the closest station compatible with the active vehicle's plug type, with available stalls, ETA from current location, and price.

#### Scenario: filtering by plug compatibility
- **WHEN** the active vehicle has a CCS plug only
- **THEN** the nearest-plug card MUST exclude stations whose stalls are CHAdeMO-only
