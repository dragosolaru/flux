# fleet-management

## ADDED Requirements

### Requirement: Multi-vehicle accounts

The system SHALL allow a user account to own multiple vehicles of different brands simultaneously. The DB schema and API MUST enforce no cap on vehicles per user, and vehicles MAY be a mix of brands and data sources.

#### Scenario: adding multiple vehicles
- **WHEN** an authenticated user calls `POST /api/vehicles` three times with three distinct `{brand, model}` payloads
- **THEN** three rows MUST be created under their `user_id`
- **AND** `GET /api/vehicles` MUST return all three

### Requirement: Garage as default landing

The system SHALL render a Garage page as the default landing for signed-in users. `/garage` SHALL display every vehicle on the account as a card in a responsive grid. Each card MUST show brand mark, nickname, current SoC, range, motion state, and a `MOCK` chip when `dataSource === "mock"`.

#### Scenario: garage is the landing
- **WHEN** an authenticated user visits `/`
- **THEN** they MUST be redirected to `/garage`

#### Scenario: empty garage state
- **WHEN** an authenticated user has zero vehicles
- **THEN** `/garage` MUST show an empty state with an "Add your first car" CTA that opens the brand picker

### Requirement: Vehicle switcher in top navigation

The system SHALL expose a vehicle switcher in the top navigation. The top bar SHALL show a pill with the current vehicle's nickname and brand mark; clicking MUST open a dropdown listing all other vehicles, and selecting a vehicle MUST navigate to `/dashboard?v=<id>`.

#### Scenario: switching active vehicle
- **WHEN** the user is on `/dashboard?v=A` and clicks vehicle `B` in the switcher
- **THEN** the URL MUST become `/dashboard?v=B`
- **AND** all dashboard data MUST reflect vehicle B

### Requirement: Dashboard deep-card view

The system SHALL render the deep-card detail view on `/dashboard?v=<id>`. The dashboard page SHALL read the `v` query param to determine the active vehicle. Without the param, it MUST fall back to the most recently used vehicle for the account.

#### Scenario: missing v param falls back to recent
- **WHEN** the user visits `/dashboard` with no `v` query param
- **AND** they have vehicles A and B, last used B
- **THEN** the dashboard MUST render B's data

### Requirement: Fleet-aggregate views on Garage

The system SHALL render fleet-aggregate views on the Garage page. The Garage SHALL include a "Fleet totals" panel summing relevant metrics across all vehicles: combined available range, total kWh charged this month, total cost this month, total CO₂ saved vs. ICE baseline. Vehicles with `null` for a given field MUST be excluded from that field's sum and footnoted.

#### Scenario: aggregate excludes vehicles without data
- **WHEN** one vehicle has `batteryRangeKm = null` (brand doesn't expose it)
- **THEN** the fleet-totals "combined range" line item MUST omit that vehicle and footnote the exclusion

### Requirement: "Which car?" cross-vehicle recommender

The system SHALL provide a "Which car?" recommender for cross-vehicle decisions. Given a destination distance, it SHALL rank vehicles by SoC sufficiency, range derating, and number of charging stops required. The result MUST be a sorted list with an explanation per vehicle.

#### Scenario: short-distance recommendation
- **WHEN** the user inputs "120 km destination"
- **AND** vehicle A has 200 km range, vehicle B has 80 km range
- **THEN** vehicle A MUST rank first ("no charging stop") and vehicle B second ("1 stop needed")

### Requirement: Multi-vehicle smart-charge coordinator

The system SHALL implement a smart-charge coordinator for multiple plugged-in vehicles. When more than one vehicle is in `plugged-idle` or `charging` state and the user has an active tariff with limited cheap-window hours, the coordinator SHALL propose an ordering that completes priority vehicles within the cheap window.

#### Scenario: coordinator ordering
- **WHEN** vehicles A (SoC 80%, target 90%) and B (SoC 20%, target 80%) are both plugged in
- **AND** the cheap-window covers 3 hours starting now
- **THEN** the coordinator MUST recommend starting B first
- **AND** MUST explain "B needs 3.2h vs A's 0.4h; starting B now fits the cheap window"
