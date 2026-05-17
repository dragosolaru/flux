# Tasks — Pivot to mock-first multi-brand platform

Phased plan. Each phase ships a coherent slice and leaves `main` deployable.

## Phase 1 — Foundations: brand registry + capability system

- [ ] 1.1 Create `src/lib/brands/` with `registry.ts`, `types.ts`, `capabilities.ts`
- [ ] 1.2 Define `BrandCapabilities` type (deep map: `telemetry.*`, `commands.*`, `refreshModel`, `historyRetention`)
- [ ] 1.3 Define `BrandProfile` interface and `BrandKey` union
- [ ] 1.4 Write Tesla brand profile (`src/lib/brands/tesla/profile.ts`) with full capability map
- [ ] 1.5 Write stubs for BMW / Polestar / Mercedes / VW / Hyundai / Renault profiles (capability maps only, adapters land in Phase 4)
- [ ] 1.6 Extend `VehicleState` in `src/types/vehicle.ts` to the full superset (11 OEM categories, nullable)
- [ ] 1.7 Add `useBrandCapabilities(brand)` hook for components
- [ ] 1.8 Add `LIVE_INTEGRATIONS` env flag plumbing; default is empty (everything mock)
- [ ] 1.9 Unit tests: registry exposes 7 brands; each profile validates against the schema; capability map is exhaustive
- [ ] 1.10 Update `.env.local.example` with `LIVE_INTEGRATIONS=` and a comment

## Phase 2 — Stateful Tier-3 simulator

- [ ] 2.1 Create `src/lib/mock/` with `engine.ts`, `scenarios.ts`, `persistence.ts`
- [ ] 2.2 Implement `tick(snapshot, now, brand) → snapshot` pure function: drain/charge/climate/odometer/location/scenario progression
- [ ] 2.3 Implement scenario JSON schema (steps with timestamps, motion transitions, location waypoints)
- [ ] 2.4 Ship 4 scenarios: `commuter.json`, `road-trip.json`, `weekend-errands.json`, `vacation.json`
- [ ] 2.5 Implement `applyCommand(snapshot, command, args, brand) → snapshot`; reject commands the brand can't do
- [ ] 2.6 Persistence layer reads/writes `mock_vehicle_state` table (Supabase service-role)
- [ ] 2.7 Implement charging session detection (consecutive `motionState === "charging"` ticks → upsert `charging_sessions` row)
- [ ] 2.8 Implement trip detection (consecutive `motionState === "driving"` ticks → upsert `trips` row)
- [ ] 2.9 Migration `002_mock_platform.sql`: alter `vehicles`, create `mock_vehicle_state`, `charging_sessions`, `trips`, RLS policies
- [ ] 2.10 Unit tests: tick is deterministic; commands mutate correctly; scenarios advance over time

## Phase 3 — Multi-vehicle architecture

- [ ] 3.1 Drop one-vehicle constraint in TS / DB
- [ ] 3.2 New route `GET /api/vehicles` — list user's vehicles
- [ ] 3.3 New route `GET /api/vehicles/:id/state` — brand-dispatched, returns `VehicleState`
- [ ] 3.4 New route `POST /api/vehicles/:id/commands` — brand-dispatched, capability-checked, returns command result
- [ ] 3.5 New route `POST /api/vehicles` — add a vehicle (mock for now: brand + nickname + model picker)
- [ ] 3.6 New route `DELETE /api/vehicles/:id` — remove vehicle (mock state cascades)
- [ ] 3.7 `useVehicles()` hook (TanStack Query): list query
- [ ] 3.8 `useVehicle(id)` hook: state query with 30s polling
- [ ] 3.9 `useVehicleCommand(id)` hook: mutation with optimistic update + invalidate
- [ ] 3.10 New page `/garage` — grid of vehicle cards (becomes default landing for signed-in users)
- [ ] 3.11 Refactor `/dashboard` to read `?v=<vehicleId>` (deep card view)
- [ ] 3.12 Vehicle switcher pill in topbar (current vehicle + dropdown of others)
- [ ] 3.13 New onboarding step: brand picker (modal or page) — pick brand + model + nickname + scenario seed
- [ ] 3.14 Migrate existing real `Black Panther` row: `data_source = 'mock'`, scenario seeded so the demo still functions

## Phase 4 — Brand mock implementations (7 brands)

For each brand: telemetry adapter that maps simulator output → brand-flavored `VehicleState` (e.g. BMW gives lower precision on tire pressure than Tesla, Polestar doesn't expose sentry), capability gating verified, sample seed data.

- [ ] 4.1 Tesla mock — Model 3 / Model Y / Model S profiles, max telemetry, max commands
- [ ] 4.2 BMW mock — i4 / iX profiles, mid-high telemetry, mid commands (no honk/flash)
- [ ] 4.3 Polestar mock — Polestar 2 / 3 profiles, mid telemetry, climate-only commands
- [ ] 4.4 Mercedes-EQ mock — EQE / EQS profiles, high telemetry, mid commands
- [ ] 4.5 VW-ID mock — ID.3 / ID.4 / ID.7 profiles, mid telemetry, mid commands
- [ ] 4.6 Hyundai/Kia mock — Ioniq 5 / EV6 profiles, mid telemetry, charge-ctrl commands
- [ ] 4.7 Renault mock — Megane E-Tech profile, low-mid telemetry, low commands
- [ ] 4.8 Per-brand display name, logo SVG, default photo asset
- [ ] 4.9 Per-brand seed (model defaults: battery capacity kWh, max charge rate kW, max range)

## Phase 5 — Extended telemetry surface in UI

- [ ] 5.1 `StatsGrid` extended: TPMS (4 tires), doors (4 + frunk + trunk), windows, sentry/dashcam, lights, mirrors, software, service-due
- [ ] 5.2 Each card gated on brand capability; missing capability → card not rendered
- [ ] 5.3 Battery health (SoH) card — only Tesla / Polestar in mock
- [ ] 5.4 Cell voltages card — only Tesla in mock
- [ ] 5.5 Cabin air quality card — only Tesla (Bioweapon mode), Mercedes
- [ ] 5.6 Driving-score card — Tesla Safety Score + BMW eco score
- [ ] 5.7 Software update card — version + update available + size + release notes (mocked)

## Phase 6 — Beyond OEM: Energy tariffs

- [ ] 6.1 `src/lib/external/tariffs/` provider abstraction
- [ ] 6.2 Mock providers: `tibber-mock`, `octopus-mock`, `awattar-mock`
- [ ] 6.3 Tariff schema: today's hourly prices (€/kWh), forecast 24h, current price, off-peak window
- [ ] 6.4 `/energy` page: price curve chart, cheapest-window highlight, per-vehicle smart-charge recommendation
- [ ] 6.5 Settings: pick active tariff provider per user
- [ ] 6.6 Smart-charge recommendation: given vehicle SoC + plug status + target SoC + tariff, recommend plug-in time
- [ ] 6.7 Dashboard sidecar: "Cheapest plug-in: 02:00–05:00, save €X vs now"

## Phase 7 — Beyond OEM: Charging-network discovery

- [ ] 7.1 `src/lib/external/charging-networks/` registry: Ionity, Tesla-SC, EnBW, Allego, Fastned
- [ ] 7.2 Mock station registry (~50 stations across EU) with stalls, plug types, max kW
- [ ] 7.3 Live-availability simulator (stalls flicker on a Poisson process)
- [ ] 7.4 `/charging-map` page: leaflet/maplibre map, station pins, click → detail panel
- [ ] 7.5 Station detail: stalls available now, price, supported plugs, distance from vehicle, ETA
- [ ] 7.6 Filter by network, by max kW, by plug type, by price
- [ ] 7.7 Per-vehicle: "Nearest plug for your car" card on dashboard

## Phase 8 — Beyond OEM: Weather + range derating

- [ ] 8.1 `src/lib/external/weather/` provider abstraction, mock provider
- [ ] 8.2 Weather schema: current temp, wind, precipitation, forecast 24h per lat/lng
- [ ] 8.3 Range derating model: temp drop → 0.5%/°C below 15°C, wind headwind impact, precipitation impact
- [ ] 8.4 Vehicle card shows "Range: 412 km (ideal 480, -14% weather)"
- [ ] 8.5 Tooltip explains derating factors

## Phase 9 — Beyond OEM: Trip planning

- [ ] 9.1 `src/lib/external/routing/` provider abstraction, mock provider (great-circle + waypoint heuristic)
- [ ] 9.2 Trip planner UI on `/trip`: origin (current vehicle position), destination (autocomplete or city picker)
- [ ] 9.3 Compute route + insert charging stops based on capacity, range derating, network coverage
- [ ] 9.4 Show: total distance, total time, charging stops with kWh + price + duration
- [ ] 9.5 Cross-vehicle comparison: "Black Panther 6h12m / 1 stop · Demo i4 6h45m / 2 stops"
- [ ] 9.6 "Take this car" action stores trip suggestion (no actual nav handoff in mock)

## Phase 10 — Aggregate / cross-vehicle features

- [ ] 10.1 Garage page fleet-totals card: combined range, monthly cost, total kWh, CO₂
- [ ] 10.2 Smart-charge coordinator: given multiple plugged-in vehicles + tariff windows, propose ordering
- [ ] 10.3 Cross-brand efficiency comparison chart (kWh/100km per car per week)
- [ ] 10.4 Grid CO₂ intensity tracker (mock provider) → "Charging now: 87 g CO₂/kWh · cleaner at 14:00"
- [ ] 10.5 "Which car?" recommender: input destination, output ranked vehicles by SoC sufficiency + charging stops needed

## Phase 11 — Mock disclosure UX

- [ ] 11.1 `<MockChip>` component (amber badge); render in `VehicleCard` header when `dataSource === "mock"`
- [ ] 11.2 Tooltip on hover with plain-language explanation
- [ ] 11.3 `<MockGlobalBanner>` — appears only when *all* user's vehicles are mock; slim, dismissible per session
- [ ] 11.4 `/about-data` page: per-category truth table (live vs mock), per-vehicle status
- [ ] 11.5 Link to `/about-data` from chip tooltip and from banner

## Phase 12 — Legacy preservation + cleanup

- [ ] 12.1 Wrap live Tesla code paths in `LIVE_INTEGRATIONS` check
- [ ] 12.2 Hide `/connect/tesla` from nav when `tesla` not in `LIVE_INTEGRATIONS`
- [ ] 12.3 `/api/tesla/*` routes return 410 Gone with a JSON message when live Tesla disabled
- [ ] 12.4 Document re-activation procedure in `docs/ARCHITECTURE.md`
- [ ] 12.5 Keep `tesla-proxy/` folder + Dockerfile; mark README.md inside with "currently dormant"

## Phase 13 — Docs + portfolio polish

- [ ] 13.1 Update `README.md` intro to reflect mock-first multi-brand direction
- [ ] 13.2 Rewrite `docs/SCOPE.md` MVP section
- [ ] 13.3 Expand `docs/ARCHITECTURE.md` with brand-registry + simulator + capability sections
- [ ] 13.4 Replace `docs/NEXT-STEPS.md` with mock-platform phase plan
- [ ] 13.5 Append `docs/CHANGELOG.md` entry for the pivot
- [ ] 13.6 Add `docs/BRANDS.md` — per-brand capability matrix as reference
- [ ] 13.7 Add `docs/SIMULATOR.md` — how the Tier-3 engine works, scenario authoring guide

## Phase 14 — Validation + portfolio demo

- [ ] 14.1 Seed demo user with 3 cars (1 Tesla mock + 1 BMW mock + 1 Polestar mock) and a tariff
- [ ] 14.2 Playwright happy-path: login → garage shows 3 cars → click each → commands work → tariff card present
- [ ] 14.3 Visual regression on garage grid (chromatic-style snapshot)
- [ ] 14.4 README screenshots / GIFs refreshed
- [ ] 14.5 Deploy preview link added to README and DAO Lab portfolio
