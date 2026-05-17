# mock-disclosure

## ADDED Requirements

### Requirement: MOCK chip on simulated vehicle cards

The system SHALL display a `MOCK` chip on every vehicle card whose data source is the simulator. The chip MUST be visually distinct (amber palette), placed in the card header, and accompanied by a hover tooltip reading "Simulated vehicle for demo. State changes are real-time but not from a real car."

#### Scenario: chip visible on mock card
- **WHEN** a vehicle card renders with `dataSource === "mock"`
- **THEN** the card header MUST contain the `MOCK` chip

#### Scenario: chip absent on live card
- **WHEN** a vehicle card renders with `dataSource === "live"`
- **THEN** the card header MUST NOT contain the `MOCK` chip

### Requirement: Demo-mode global banner

The system SHALL render a global "Demo mode" banner when every vehicle on the account is mock. The banner MUST appear at the top of authenticated pages, be slim (single line), dismissible per browser session, and read "You are in Demo mode — connect a real vehicle to see live data." If at least one vehicle is `live`, the banner MUST be suppressed.

#### Scenario: banner visible when all-mock
- **WHEN** the user's account has 3 vehicles, all with `dataSource === "mock"`
- **THEN** the global banner MUST be rendered on every authenticated page

#### Scenario: banner suppressed when mixed
- **WHEN** the user's account has 2 mock vehicles and 1 live
- **THEN** the global banner MUST NOT be rendered

### Requirement: `/about-data` transparency page

The system SHALL provide a transparency page at `/about-data`. The page MUST list, per data category and per vehicle, whether the data is `live` or `mock`. Categories MUST include telemetry, commands, tariff, charging-network, weather, and routing.

#### Scenario: about-data shows mixed status
- **WHEN** a user has a live Tesla, a mock BMW, and an active mock tariff provider
- **THEN** `/about-data` MUST list Tesla telemetry as live, BMW telemetry as mock, and tariff as mock

### Requirement: Links to `/about-data` from chip and banner

The system SHALL link to `/about-data` from the MOCK chip tooltip and the global banner. Both surfaces MUST include a "Learn more" link routing to `/about-data` via the standard router (no full-page reload).

#### Scenario: link present in tooltip
- **WHEN** the user hovers the MOCK chip
- **THEN** the tooltip MUST contain a "Learn more" link to `/about-data`
