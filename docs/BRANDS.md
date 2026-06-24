# BRANDS — Tesla MVP

Currently only Tesla is in the active brand registry. Other brands (BMW, Polestar, Mercedes-EQ, VW, Hyundai/Kia, Renault) are archived on the `demo-brands-archive` branch and can be cherry-picked back when expanding.

Source of truth: `src/lib/brands/tesla/profile.ts` and `src/lib/brands/models.ts`.

---

## Tesla — full capability profile

| Models | Default scenarios |
|---|---|
| Model 3, Model Y, Model S, Model X | commuter · weekend-errands · road-trip · vacation |

### Telemetry (32 capability flags; all `true` except `efficiencyScore`)
battery (level, range, charge limit, charging state, rate, time-to-full, health, cell voltages) · drive (odometer, speed, heading, location) · climate (interior/exterior temp, climate on/off, driver/passenger temp, HVAC mode, seat/steering heating) · body (locked, doors, windows, trunk, frunk, sentry mode, dashcam) · software (version, update available) · tire pressure · scores (safety only — `efficiencyScore: false`)

### Commands (22 supported)
lock/unlock · climate on/off + temp · honk · flash · charge limit + amps · start/stop charging · open/close charge port · vent/close windows · activate/deactivate sentry · remote start · schedule charging · schedule departure · precondition max · share navigation

### History
- Retention: unlimited
- Charging sessions: ✓
- Trips: ✓
- Consumption: ✓
- Command log: ✓

### Live integration
- Tesla Fleet API via `src/lib/tesla/api.ts`
- OAuth 2.0 + PKCE via `/api/tesla/connect` and `/api/tesla/callback`
- Tokens encrypted at rest (AES-256-GCM) in `tesla_tokens` table
- Region auto-probe (EU / NA / CN)
- Wake-on-408 (auto-wake when vehicle returns timeout)
- Activated per-vehicle when `LIVE_INTEGRATIONS=tesla` env var is set

### Refresh model
- Mock: deterministic tick on every read (no background worker)
- Live: 30-second polling on dashboard, on-demand for commands

---

## Adding a new brand

See `docs/LIVE-VS-DEMO.md` for the recovery path from the archive branch. Minimum steps to re-introduce a brand:

1. `git checkout demo-brands-archive -- src/lib/brands/<brand>`
2. Update `src/lib/brands/types.ts` to add the brand key to the `BrandKey` union
3. Update `src/lib/brands/registry.ts` to import and register the profile in `BRANDS`
4. Update `src/lib/brands/models.ts` to add the brand's `BRAND_MODELS` entry
5. Update `src/lib/mock/seed.ts` `SOFTWARE_VERSIONS` map
6. Update `src/components/ui/BrandLogo.tsx` to add the brand SVG
7. Update `src/components/onboarding/AddVehicleModal.tsx` to add brand selection
8. (Live only) Implement `src/lib/<brand>/api.ts` + `src/app/api/<brand>/` OAuth routes
9. Add to `LIVE_INTEGRATIONS` env var to enable live mode

For adding a single command (not a whole brand), follow the checklist in `CLAUDE.md`:
`CommandName` (types/history.ts) → `CommandCapabilities` (brands/types.ts) →
`COMMAND_CAP_MAP` (brands/command-map.ts) → `TESLA_COMMAND_MAP` (brands/tesla/command-map.ts) →
`TeslaCommand` (types/tesla.ts) → tesla profile → mock engine switch case.
