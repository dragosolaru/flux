# NEXT STEPS — Flux (Phase 13, 2026-05-18)

Phases 1–6 are implemented. This file covers the remaining phases 7–14 from `openspec/changes/pivot-mock-first-platform/tasks.md`.

## Phase 7 — Beyond OEM: Charging-network discovery

- `src/lib/external/charging-networks/` registry: Ionity, Tesla-SC, EnBW, Allego, Fastned
- Mock station registry (~50 EU stations) with stalls, plug types, max kW, base price
- Live-availability simulator: stalls flicker on a Poisson process
- `/charging-map` page: Leaflet/MapLibre map with station pins and click-to-detail panel
- Station detail panel: stalls available now, price, supported plugs, distance from vehicle, ETA
- Filter by network, max kW, plug type, price
- Per-vehicle "Nearest plug for your car" card on dashboard

## Phase 8 — Beyond OEM: Weather + range derating

- `src/lib/external/weather/` provider abstraction, mock provider
- Weather schema: current temp, wind, precipitation, 24h forecast per lat/lng
- Range derating model: −0.5%/°C below 15°C, wind headwind impact, precipitation impact
- Vehicle card shows "Range: 412 km (ideal 480, −14% weather)"
- Tooltip explains derating factors

## Phase 9 — Beyond OEM: Trip planning

- `src/lib/external/routing/` provider abstraction, mock provider (great-circle + waypoint heuristic)
- `/trip` page: origin (current vehicle position), destination (autocomplete or city picker)
- Route computation with optimal charging stops based on capacity, derating, network coverage
- Output: total distance, total time, charging stops with kWh + price + duration
- Cross-vehicle comparison: "Black Panther 6h12m / 1 stop · Demo i4 6h45m / 2 stops"
- "Take this car" action stores trip suggestion

## Phase 10 — Aggregate / cross-vehicle features

- Garage page fleet-totals card: combined range, monthly cost, total kWh, CO₂
- Smart-charge coordinator: given multiple plugged-in vehicles + tariff windows, propose charging order
- Cross-brand efficiency comparison chart (kWh/100km per car per week)
- Grid CO₂ intensity tracker (mock provider) → "Charging now: 87 g CO₂/kWh · cleaner at 14:00"
- "Which car?" recommender: input destination, rank vehicles by SoC sufficiency + charging stops needed

## Phase 11 — Mock disclosure UX

- `<MockChip>` component (amber badge) in `VehicleCard` header when `dataSource === "mock"`
- Tooltip on hover with plain-language explanation
- `<MockGlobalBanner>` — slim dismissible banner when all user vehicles are mock
- `/about-data` page: per-category truth table (live vs mock), per-vehicle status
- Links to `/about-data` from chip tooltip and banner

## Phase 12 — Legacy preservation + cleanup

- Wrap live Tesla code paths in `LIVE_INTEGRATIONS` check
- Hide `/connect/tesla` from nav when `tesla` not in `LIVE_INTEGRATIONS`
- `/api/tesla/*` routes return `410 Gone` with JSON message when live Tesla is disabled
- Document re-activation procedure in `docs/ARCHITECTURE.md` (§ Legacy live-Tesla preservation)
- Keep `tesla-proxy/` folder + Dockerfile; mark README.md inside with "currently dormant"

## Phase 13 — Docs + portfolio polish

- [x] Update `README.md` to reflect mock-first multi-brand platform
- [x] Rewrite `docs/SCOPE.md` MVP section
- [x] Expand `docs/ARCHITECTURE.md` with brand-registry, simulator, capability sections
- [x] Add `docs/BRANDS.md` — per-brand capability matrix
- [x] Add `docs/SIMULATOR.md` — Tier-3 engine guide + scenario authoring
- [x] Append `docs/CHANGELOG.md` entry for phases 1–6
- [x] Replace `docs/NEXT-STEPS.md` with remaining phases 7–14

## Phase 14 — Validation + portfolio demo

- Seed demo user with 3 cars (1 Tesla mock + 1 BMW mock + 1 Polestar mock) and a tariff
- Playwright happy-path: login → garage shows 3 cars → click each → commands work → tariff card present
- Visual regression on garage grid (chromatic-style snapshot)
- README screenshots / GIFs refreshed
- Deploy preview link added to README and DAO Lab portfolio

---

## Future roadmap (post-mock)

| Phase | Theme | Highlights |
|---|---|---|
| 0.2 | Re-activate Tesla live | `LIVE_INTEGRATIONS=tesla`, re-run vehicle-command-proxy on Fly.io |
| 0.3 | BMW + Polestar live | First non-Tesla live adapters |
| 0.4 | Mercedes / VW / Hyundai / Renault | Continue brand coverage live |
| 0.5 | Real tariff providers | Tibber + Octopus real APIs |
| 0.6 | Real charging-network data | OpenChargeMap + Ionity / Fastned real APIs |
| 0.7 | iOS / Android widgets | Read-only battery + range widget |
| 0.8 | Trip routing real | ABRP-grade real planner |
| 1.0 | Monetization | Freemium (1 vehicle) + Pro at €4.99/month |

---

## To start implementing

```bash
cd /home/user/flux
nvm use
npm run dev
```

Then open the OpenSpec change and apply tasks:

```bash
openspec show pivot-mock-first-platform
openspec status pivot-mock-first-platform
# or in Claude Code: /opsx:apply
```

## Common issues

- `npm run dev` failing → check `nvm use` (Node 22 in `.nvmrc`).
- Supabase migration conflicts → run on a fresh project, point local at it via `.env.local`.
- Simulator tick producing non-deterministic output → verify no `Date.now()` or `Math.random()` leaks into `tick()` outside the seeded RNG and the explicit `now` parameter.
