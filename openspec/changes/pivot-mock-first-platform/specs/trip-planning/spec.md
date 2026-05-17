# trip-planning

## ADDED Requirements

### Requirement: Route with charging-stop insertion

The system SHALL provide a trip planner that computes route and charging stops. The `/trip` page SHALL accept a destination input. The planner MUST compute total distance, route waypoints, and insert charging stops based on the active vehicle's SoC, derated range, and the charging-network registry.

#### Scenario: short trip needs no stop
- **WHEN** the destination is 80 km away
- **AND** the vehicle has derated range 200 km
- **THEN** the planner MUST return 0 charging stops and an estimated arrival time

#### Scenario: long trip inserts stops with sufficient buffer
- **WHEN** the destination is 700 km away
- **AND** the vehicle has derated range 400 km
- **THEN** the planner MUST insert at least one charging stop
- **AND** each stop MUST leave the vehicle with ≥ 10% reserve on arrival at the next stop

### Requirement: Cross-vehicle trip comparison

The system SHALL allow cross-vehicle comparison of the same trip. Given a planned trip, the user MUST be able to request the comparison view that recomputes the plan for each vehicle on the account and lists per-vehicle total time, stops, and energy cost.

#### Scenario: comparison ranks fastest
- **WHEN** the comparison runs for a 600 km trip across three vehicles
- **THEN** the result MUST be ordered ascending by total trip time (driving + charging)

### Requirement: Persisting selected trip suggestions

The system SHALL persist suggested trips for follow-up. Selecting "Take this car" on a comparison MUST store the suggestion under the vehicle's record. No real navigation hand-off is required in mock mode.

#### Scenario: suggested trip stored
- **WHEN** the user selects "Take Black Panther" on a comparison
- **THEN** a `trip_suggestions` row MUST be persisted with the route, stops, and selected vehicle
