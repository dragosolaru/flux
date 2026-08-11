# LIVE vs DEMO — Separation Strategy

> How Flux distinguishes real-vehicle data from simulator state, and how to operate each mode safely.

---

## The two modes

| Concept | Where it lives | Values |
|---|---|---|
| Per-vehicle data source | `vehicles.data_source` column | `mock` \| `live` |
| Per-brand live availability | `LIVE_INTEGRATIONS` env var | comma-separated brand keys; empty = all mock |
| Per-vehicle live credentials | `tesla_tokens` table (AES-256-GCM encrypted) | one row per paired vehicle |

A vehicle goes "live" only when **all three** are true:
1. `LIVE_INTEGRATIONS` contains the brand key
2. `vehicles.data_source = 'live'`
3. Encrypted OEM tokens exist for that vehicle (via OAuth pairing)

If any condition fails, the API auto-routes that vehicle to the mock simulator. No silent failures, no half-live state.

---

## Decision tree

```
GET /api/vehicles/:id/state
        │
        ▼
 isLiveEnabled(vehicle.brand)?
        │
   ┌────┴────┐
  yes        no
   │          │
   ▼          ▼
 data_source  ────────►  mock simulator tick()
 = 'live'?
   │
   ▼
 fetch tokens, refresh if expired
   │
   ▼
 call OEM API → adapter → VehicleState
```

The same dispatcher logic runs for `POST /commands` — capability-gated against `BrandCapabilities.commands.*` first, then live-or-mock dispatch.

---

## Why this design

- **Safe defaults**: a brand-new account creates mock vehicles only. No risk of sending real commands to a real car by accident.
- **Per-vehicle toggle**: a user can have one mock Tesla (for demo) and one live Tesla (paired) in the same account.
- **Same UI**: capability gating works identically — the climate panel doesn't care whether the data came from the simulator or the Fleet API.
- **Audit trail**: live commands go through `command_events` table; mock commands go through the same table but with `is_simulated = true` (when added).

---

## Operating modes

### Demo / Sandbox (default)
```bash
LIVE_INTEGRATIONS=         # empty
```
Every vehicle is mock. Safe for public demos, internal QA, automated tests. The `MockChip` badge appears on every vehicle card.

### MVP / Production (Tesla only)
```bash
LIVE_INTEGRATIONS=tesla
```
Users can create mock Teslas (data_source=mock) OR pair real Teslas (data_source=live via OAuth). Both coexist in the same account. The `MockChip` only appears on mock vehicles.

### Future: additional brands
When adding BMW, Polestar, etc.:
1. Cherry-pick the brand from `demo-brands-archive` into `src/lib/brands/{brand}/`
2. Implement live adapter in `src/lib/{brand}/api.ts` following Tesla's pattern
3. Add brand-specific OAuth routes under `src/app/api/{brand}/`
4. Add brand key to `LIVE_INTEGRATIONS` to enable

---

## Storage separation

| Storage | Mock vehicles | Live vehicles |
|---|---|---|
| `vehicles` row | yes (`data_source='mock'`) | yes (`data_source='live'`) |
| `mock_vehicle_state` snapshot | yes (full state JSON) | no |
| `tesla_tokens` encrypted tokens | no | yes |
| `charging_sessions` / `trips` | yes (derived from simulator transitions) | yes (synced from OEM history) |
| `command_events` | yes (instant apply) | yes (Fleet API call result) |
| `documents` / `energy_costs` | shared | shared |

`charging_sessions`, `trips`, `documents`, `energy_costs` all use `vehicle_id` foreign key without caring about source. Cost Intelligence works for both modes transparently.

---

## Demo branch

The 6 non-Tesla brand profiles (BMW, Polestar, Mercedes-EQ, VW, Hyundai/Kia, Renault) plus the multi-brand `seed-demo` route live on `demo-brands-archive`. To bring back a specific brand:

```bash
git checkout demo-brands-archive -- src/lib/brands/bmw
git checkout demo-brands-archive -- src/components/ui/BrandLogo.tsx
# update src/lib/brands/registry.ts and types.ts to add it back
```

---

## Security implications

- **`SUPABASE_SERVICE_ROLE_KEY`** bypasses RLS. Used only server-side via `createSupabaseAdminClient()`. Never leaked to client bundles.
- **`TESLA_TOKEN_ENCRYPTION_KEY`** must be a 32-byte hex string. Tokens at rest are AES-256-GCM encrypted; the IV is stored alongside the ciphertext.
- **OAuth callbacks** validate `state` parameter to prevent CSRF.
- **`/api/vehicles/[vehicleId]/commands`** requires authenticated session + vehicle ownership check before sending any Fleet API call. (It replaced `/api/tesla/command`, which was deleted as dead code — it had no callers and weaker handling.)
- **Live mode does not "leak" into mock**: dispatcher routes by `data_source` column; flipping the column requires explicit user action (OAuth completion).
