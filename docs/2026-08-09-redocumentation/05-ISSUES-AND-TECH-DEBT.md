# 05 — Issues, Dead Code and Tech Debt

*The fix-later list. 2026-08-09. Every entry carries a `file:line` reference.*

Priorities: **P1** = user-visible, costs money, or breaks a project rule ·
**P2** = maintenance burden or duplication · **P3** = tidy-up.

---

## Summary

| ID | P | Category | One line |
|---|---|---|---|
| B-1 | P1 | Bug / cost | Subscription document limits stubbed open |
| B-2 | P1 | Bug | Charger viewport truncation is silent to the caller |
| D-1 | P2 | Duplication | Two map screens doing overlapping jobs |
| D-2 | P2 | Dead code | Two charger API routes with zero consumers |
| D-3 | P2 | Dead code | Four unreferenced modules |
| D-4 | P2 | Dead code | `charging-networks` module mostly orphaned |
| C-1 | P2 | Consistency | `/api/charging-map` has auth but no rate limit |
| C-2 | P2 | Process | No CI migration runner; 44 migrations applied by hand |
| C-3 | P2 | Process | Playwright suite exists, CI gate not enforced |
| C-4 | P3 | Docs drift | `CODEBASE_CONTEXT.md` documents functions that are dead |
| C-5 | P3 | Ops | Silent failure when `TOMTOM_API_KEY` is absent |

**Not found, and worth stating:** zero TypeScript errors, zero lint errors,
zero `any`/`as any`/`@ts-ignore`, zero i18n key drift, one `TODO` in real
source. The usual sources of tech debt in a project this size are absent.

---

## P1 — Fix before customers

### B-1 · Subscription document limits return `allowed: true` unconditionally

**`src/lib/subscription.ts:66-79`**

```ts
// TODO(live): re-enable per-tier limits before launch
export async function canUploadDocument(_userId: string) { return { allowed: true }; }
export async function canUploadVaultDocument(_userId: string) { return { allowed: true }; }
```

Every upload triggers a paid Claude Vision call. Free tier is currently
unlimited, so the Anthropic bill is unbounded by self-service signup.
`canAddVehicle` (`:46-65`) still enforces correctly — this is only the OCR path.

**Fix:** restore the pre-`9715eb1` bodies. Tracked in `src/lib/roadmap.ts:44-50`
and correctly marked as un-checkable from config, because the stubs return the
same shape as the real implementation.

*Also filed as security finding S-2.*

### B-2 · Charger viewport truncation is invisible to the caller

**`src/lib/migrations/registry.ts:69`** (migration 044), **`src/lib/chargers/query.ts`**, **`src/app/api/chargers/route.ts`**

Migration 044 fixed a genuinely nasty field-reported bug — stations showed on
the map, vanished on zoom-in, reappeared on zoom-out — caused by four layers
disagreeing about the row limit (2000 / 2000 / 5000 / 500), with the lowest
winning. Because ordering is `confidence desc`, the surviving rows were spread
across the whole bbox rather than the part being looked at.

The cap was raised to 2000 and a stable `id` tiebreak added. **The remaining
flaw is acknowledged in the migration comment and still open:** truncation is
invisible to the caller, because the response is a bare array with nowhere to
report it. A continent-wide bbox still silently drops stations.

**Fix:** wrap the response — `{ chargers: [...], truncated: boolean }` — and
show a "zoom in for more" hint in the map UI when `truncated` is true.

---

## P2 — Duplication and dead code

### D-1 · Two map screens with overlapping jobs

- **`src/app/(dashboard)/map/map-client.tsx`** — 2163 lines. Explore + plan, bottom-sheet driven, saved routes, share, preconditioning, corridor stations.
- **`src/app/(dashboard)/charging-map/charging-map-client.tsx`** — 321 lines. Explore only.

Both consume the same `@/lib/api/chargers`. Both are in the nav
(`src/components/layout/BottomNav.tsx`, `Sidebar.tsx`).

This pattern has already caused real harm once. `src/app/(dashboard)/trip/page.tsx:1-13`
records it: maintaining two planners "produced three bugs in a row from a
feature landing on one screen only — most seriously preconditioning decided
from the first stop on one and every stop on the other." The fix there was to
retire `/trip` to a redirect. The same reasoning applies to `/charging-map`.

**Fix:** retire `/charging-map` to `redirect("/map?mode=explore")`, exactly as
`/trip` was handled — preserving bookmarks, deleting the second surface. If the
simpler screen has a real purpose (it may be genuinely better on a small
phone), document that purpose; otherwise it is a second place for the next
feature to not land.

### D-2 · Two charger API routes with zero consumers

- **`src/app/api/charging-map/route.ts`** (44 lines) — no callers in `src/` or `e2e/`
- **`src/app/api/charging-stations/route.ts`** (64 lines) — no callers in `src/` or `e2e/`

Verified by searching for every string form of the paths. Both predate the
PostGIS pipeline and are superseded by `/api/chargers`.
`charging-stations/route.ts:12` re-exports a `ChargingStation` type "so existing
importers keep working" — those importers no longer exist either.

**Fix:** delete both. Move the `ChargingStation` type to
`src/lib/external/charging-networks/live-stations.ts` if anything still needs it.

### D-3 · Four unreferenced modules

Verified unreferenced across `src/` and `e2e/`:

| File | Export | Note |
|---|---|---|
| `src/lib/ai/prompts/document-triage.ts:1` | `DOCUMENT_TRIAGE_PROMPT` | Written for the triage pre-pass that `docs/ROADMAP.md` still lists as planned. Either wire it into `src/lib/costs/processor.ts` or delete it. |
| `src/lib/currency/convert.ts:14,35` | `convertCurrency`, `convertCurrencySync` | **Documented as in use** in `CODEBASE_CONTEXT.md` and announced in `CHANGELOG.md` (2026-05-24). Neither is called anywhere. See C-4. |
| `src/hooks/useVirtualKeyPair.ts:4` | `useVirtualKeyPair` | Virtual-key pairing moved into the `/debug` console. Superseded. |
| `src/components/vehicles/VehicleIcon.tsx:180` | `VehicleIcon` | 180+ lines. Note `src/components/vehicles/` vs `src/components/vehicle/` — two directories one letter apart, and the orphan is in the plural one. |

**Fix:** delete three, decide on the triage prompt. Then merge
`components/vehicles/` into `components/vehicle/` so the near-identical
directory names stop existing.

### D-4 · `charging-networks` module is mostly orphaned

**`src/lib/external/charging-networks/`**

After D-2, the only remaining consumers are
`src/lib/external/routing/corridor-stations.ts`, `planner.ts`, `types.ts` and
two test files. The hardcoded `STATIONS` list and the mock `getStations()` /
`getAllAvailability()` / `getNetworkMeta()` surface exist only to serve the two
dead routes.

**Fix:** after deleting D-2, prune to just what the router imports.

### C-1 · `/api/charging-map` authenticates but does not rate limit

**`src/app/api/charging-map/route.ts:9-14`**

Every sibling charger route calls `checkRateLimit`; this one does not. Moot once
D-2 deletes it — noted so the omission is not copied into a replacement.

### C-2 · No CI migration runner

44 migrations in `supabase/migrations/`, applied by hand in the Supabase SQL
editor. There is no record in git of what is applied in production, so
"what is the schema in prod?" is unanswerable from the repository.
`src/lib/migrations/registry.ts` + `/api/internal/debug/migrations` mitigate
this with an in-app runner, which is a good workaround, but the four migrations
listed as pending in `docs/LAUNCH-CHECKLIST.md` — including the RLS one — have
unknown status.

**Fix:** either a CI step, or have the debug panel display applied-vs-pending
state as its headline so drift is visible without reading a checklist.

### C-3 · Playwright suite exists, CI gate not enforced

`e2e/` exists and `npm run test:e2e` runs it. `docs/ROADMAP.md` marks the CI
gate as "partial"; `.github/` was not inspected in detail in this pass. With
commits going straight to `main` by policy (`AGENTS.md`), an unenforced gate
means nothing catches a regression before deploy.

---

## P3 — Tidy-up

### C-4 · `CODEBASE_CONTEXT.md` documents dead functions

`CODEBASE_CONTEXT.md` lists `convertCurrency()` / `convertCurrencySync()` in the
file map as live infrastructure, and `CHANGELOG.md` announces them as a shipped
feature. Both are dead (D-3). An agent reading `CODEBASE_CONTEXT.md` as "the
single source of architectural truth" — which the file explicitly instructs —
will be misled.

**Fix:** bundle with D-3.

### C-5 · Missing `TOMTOM_API_KEY` fails silently

`docs/LAUNCH-CHECKLIST.md` §2 records that without the key the TomTom connector
"returns empty silently", losing roughly a third of station coverage plus all
per-connector power data. A silent third of your data disappearing is not a
config nit.

**Fix:** surface absent optional-but-important keys as a warning in the
`/debug` config panel — it already reports booleans for other integrations, so
the mechanism exists.

---

## Suggested order

**One sitting (~2 hours):** D-2 → D-3 → D-4 → C-1 → C-4. Pure deletion, no
behaviour change, removes ~400 lines and four traps for future contributors.

**One sitting (~1 hour):** B-1. Restore two function bodies.

**Half a day:** D-1 (retire `/charging-map`, mirroring the `/trip` precedent)
and B-2 (wrap the charger response, add the zoom hint).

**Ongoing:** C-2, C-3, C-5 — process work, worth doing before a second person
joins the repo.
