# weather-and-range

## ADDED Requirements

### Requirement: Weather provider abstraction

The system SHALL expose a weather provider abstraction with at least one mock provider. Providers MUST implement `getCurrent(lat, lng)` and `getForecast(lat, lng, hours)`. The schema MUST include temperature (°C), wind speed (m/s) and direction, precipitation, cloud cover, and humidity.

#### Scenario: weather available at vehicle location
- **WHEN** the system fetches weather for a vehicle at given coordinates
- **THEN** the mock provider MUST return plausible values that vary by region and hour

### Requirement: Weather-aware range derating

The system SHALL derate the displayed vehicle range using current weather. The derating model MUST apply at least:
- Temperature: approximately −0.5% per °C below 15°C and +0.2% per °C above 25°C up to a floor.
- Wind: ~1% reduction per 5 m/s of headwind component.
- Precipitation: ~3% reduction during active rain.

The Dashboard SHALL show both the ideal and the derated range with a tooltip explaining the deltas.

#### Scenario: cold weather derating
- **WHEN** the brand reports 480 km range
- **AND** ambient temperature is −5°C, no wind, no precipitation
- **THEN** the displayed range MUST be approximately 432 km
- **AND** the tooltip MUST explain "−10% temperature"

#### Scenario: derating delta hidden when weather unavailable
- **WHEN** the weather provider is unavailable
- **THEN** the Dashboard MUST show only the brand-reported range without a "(ideal X, -Y%)" suffix
