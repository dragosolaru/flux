# Design: Saved Routes + Preconditioning for Any Charger

**Date:** 2026-06-24  
**Status:** Approved — ready for implementation

---

## Context

The trip planner (`/trip`) calculates routes with charging stops but doesn't persist them. Users who stop overnight and want to continue the same route the next day must re-enter everything. Additionally, battery preconditioning currently only triggers for Supercharger stops; the user wants preconditioning activated for any charging stop in the route.

---

## Feature 1: Saved Routes

### What it does

Users can save a calculated trip route (with all charging stops) and reload it later. Max 10 routes per user. Routes are auto-named "Origine → Destinație" with the option to rename at any time.

### Database

New table `saved_routes` (migration 032):

```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
name          TEXT NOT NULL  -- e.g. "Brașov → București"
origin_label  TEXT NOT NULL
origin_lat    FLOAT8 NOT NULL
origin_lng    FLOAT8 NOT NULL
destination_label TEXT NOT NULL
destination_lat   FLOAT8 NOT NULL
destination_lng   FLOAT8 NOT NULL
stops         JSONB NOT NULL DEFAULT '[]'  -- ChargingStop[]
plan_snapshot JSONB NOT NULL DEFAULT '{}'  -- full TripPlan for instant reload
created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
```

RLS: users can only SELECT/INSERT/UPDATE/DELETE their own rows (`user_id = auth.uid()`).

The 10-route limit is enforced at API level (not a DB trigger) — returns 422 with a translated error message.

### API

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/saved-routes` | List all routes for the authenticated user |
| POST | `/api/saved-routes` | Save a route (validates limit ≤ 10) |
| PATCH | `/api/saved-routes/[id]` | Rename (updates `name` only) |
| DELETE | `/api/saved-routes/[id]` | Delete |

All endpoints: auth check → UUID validation → rate limit (`saved-routes-write`, 30/h) → ownership check.

### UI — Trip Planner

**Entry points:**

1. **Bookmark icon** in the trip planner header → opens a bottom sheet listing all saved routes
2. **"Salvează ruta"** button appears in the results panel after a route is successfully calculated

**Save flow:**
1. User calculates a route → "Salvează ruta" button appears
2. Route is saved with auto-name "Origine → Destinație"
3. Toast: *"Rută salvată. Apasă pe 🔖 pentru a redenumi."*

**Load flow:**
1. Tap bookmark icon → bottom sheet opens
2. Each row shows: name, "Brașov → București · 3 opriri · 4h 20min", date saved
3. Tap row → fields populate + route recalculates immediately
4. Swipe left → delete; tap name → rename inline

**Limit reached:** "Salvează ruta" button shows tooltip *"Ai atins limita de 10 rute salvate. Șterge una pentru a adăuga alta."*

---

## Feature 2: Preconditioning for Any Charging Stop

### What it does

When the user taps "Trimite la mașină":
1. **All charging stops** are sent as waypoints in a single `share_navigation` call — Tesla receives the complete route
2. For any non-Tesla stop in the route, `precondition_max: on` is called immediately at departure
3. Tesla's firmware handles Supercharger preconditioning automatically; for other DC fast chargers, the car decides when to activate based on distance and temperature

A **manual "Pornește precondiționare"** button remains visible in the results panel as a fallback.

### Disclaimer (shown once after "Trimite la mașină")

> *"Tesla gestionează automat precondiționarea la Superchargere. Pentru stații non-Tesla, am activat precondiționarea la plecare — mașina decide când să o pornească efectiv, în funcție de distanță și temperatură."*

Shown as a small info-box (dismissable, stored in localStorage so it doesn't repeat).

### Mock Engine

`precondition_max` command sets `isBatteryPreconditioning: true` on `VehicleState`. The dashboard shows a "Baterie precondiționată 🔋" status chip. Cleared automatically when the mock simulates a charging session end.

### Behavior Summary

| Scenario | Behavior |
|---|---|
| Route with Supercharger stops | Tesla preconditions automatically — no action needed |
| Route with non-Tesla DC fast stops | `precondition_max: on` at departure; car handles timing |
| Manual button | Always available; sends `precondition_max: on` regardless of route |
| Mock mode | `isBatteryPreconditioning: true` → chip on dashboard |

---

## Key Files (to be created/modified)

**New:**
- `supabase/migrations/032_saved_routes.sql`
- `src/app/api/saved-routes/route.ts` (GET, POST)
- `src/app/api/saved-routes/[routeId]/route.ts` (PATCH, DELETE)
- `src/hooks/useSavedRoutes.ts`

**Modified:**
- `src/app/(dashboard)/trip/trip-client.tsx` — save button, bookmark icon, bottom sheet, preconditioning for all stops
- `src/lib/mock/engine.ts` — `precondition_max` sets `isBatteryPreconditioning`
- `src/lib/i18n/locales/*.json` — 5 locale files (new keys)
- `docs/FEATURES.md` — update trip planner section

---

## Out of Scope

- Geofence-based automatic preconditioning (requires continuous location polling — future feature)
- Push notification "approaching charger" trigger (complex background scheduling — future feature)
- Sharing saved routes between users
