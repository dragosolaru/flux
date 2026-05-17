# energy-tariffs

## ADDED Requirements

### Requirement: Pluggable tariff provider registry

The system SHALL support pluggable energy-tariff providers via a registry. Providers SHALL expose a uniform interface: `getTodayPrices()`, `getForecast(hours)`, `getCurrentPrice()`. Initial mock providers MUST include `tibber-mock`, `octopus-mock`, and `awattar-mock`. The user SHALL select an active provider in settings.

#### Scenario: switching tariff provider
- **WHEN** the user changes the active tariff provider in settings from `tibber-mock` to `octopus-mock`
- **THEN** the price curve and recommendations on `/energy` MUST refresh to the new provider's data within one polling cycle

### Requirement: 24-hour price curve with cheapest-window highlight

The system SHALL render a 24-hour price curve and highlight the cheapest contiguous charging window. The `/energy` page SHALL display the next 24 hours of tariff prices as a chart, and the cheapest contiguous N-hour window (where N is derived from the user's vehicles' charging needs) MUST be visually highlighted.

#### Scenario: cheapest window matches vehicle needs
- **WHEN** the user's vehicle needs ~4 hours to reach the target SoC at the home AC charger rate
- **THEN** the cheapest 4-hour contiguous window MUST be highlighted on the price chart

### Requirement: Per-vehicle smart-charge recommendation

The system SHALL compute a smart-charge recommendation per vehicle. For each vehicle that is `plugged-idle` or just plugged in, the dashboard SHALL surface a recommendation of the form "Start charging at HH:MM to save €X". Computation factors MUST include current SoC, target SoC, charge rate at the current plug, and tariff curve.

#### Scenario: recommendation when cheaper window is later
- **WHEN** the current tariff price is €0.30/kWh and a window 4h from now is €0.10/kWh
- **AND** the vehicle's charge takes 3 hours
- **THEN** the recommendation MUST read "Wait until <window start>; save ~€<delta>"

#### Scenario: no recommendation when target reached
- **WHEN** the vehicle SoC is already at or above the target
- **THEN** no smart-charge recommendation card MUST be rendered for that vehicle

### Requirement: Garage page tariff hint

The system SHALL surface a "cheapest plug-in time" hint on the Garage page. When an active tariff is configured and at least one unplugged vehicle would benefit from charging, the Garage MUST display a one-line hint of the form "Cheapest plug-in: HH:MM–HH:MM (save €X vs now)".

#### Scenario: passive hint visible
- **WHEN** the user has a tariff configured and at least one unplugged vehicle that would benefit from charging
- **THEN** the Garage MUST show "Cheapest plug-in: HH:MM–HH:MM (save €X vs now)"
