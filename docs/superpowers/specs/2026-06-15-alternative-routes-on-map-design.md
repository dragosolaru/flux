# Alternative routes on the trip-planner map — Design

**Date:** 2026-06-15
**Status:** Approved
**Scope:** `/map?mode=plan`

## Problem

The trip planner already computes up to 4 `TripVariant`s and lets the user
switch between them with chips. But only the *active* variant's polyline is
drawn on the map. The alternative roads are invisible — the user cannot see or
tap a different road directly on the map.

## Key finding

`TripMap.tsx` **already implements** the full multi-route rendering:
`routes?: RouteLine[]` + `onRouteSelect?: (index) => void` props draw inactive
roads as subtle dashed grey lines with an invisible wide hit-area, and the
active road as a prominent purple line on top (`TripMap.tsx:149-200`). This
code is dead — `map-client.tsx` never passes `routes`/`onRouteSelect`.

The work is purely **wiring** in `map-client.tsx`.

## Decision: unique roads only

Variants combine two dimensions: physical road (`roadIndex`, max 3) and
charging strategy (`fastest` / `balanced`). The same road can appear twice with
different strategies (same polyline, different stops).

On the map we draw **unique physical roads** (max 3 lines), deduplicated by
`roadIndex`. Strategy stays selectable via the existing chip row. Tapping a road
selects the first (fastest) variant for that road.

## Architecture & data flow

```
variants: TripVariant[]            (existing)
  ↓ useMemo: dedupe by roadIndex, take first variant's plan.polyline
routeLines: RouteLine[]            (index = roadIndex, active = matches active variant's road)
  ↓ props
<TripMap routes onRouteSelect />   (existing rendering)
  ↓ user taps a grey road
onRouteSelect(roadIndex)
  ↓ findIndex first variant with that roadIndex
setActiveVariant(idx)              (existing state)
  ↓ chips + stops + cost summary + active polyline all refresh (existing)
```

## Changes

### `src/app/(dashboard)/map/map-client.tsx` (only file changed)

1. `routeLines: RouteLine[]` via `useMemo` over `variants`:
   - group by `roadIndex`, keep first variant per road that has a polyline
   - `coordinates` = `variant.plan.polyline.coordinates` (`[lng, lat]`, as `RouteLine` expects)
   - `active` = `variant.roadIndex === variants[activeVariant]?.roadIndex`
   - return `[]` when fewer than 2 unique roads (so the simple-polyline fallback in `TripMap` is used)
2. `handleRouteSelect(roadIndex)` → `setActiveVariant(variants.findIndex(v => v.roadIndex === roadIndex))` (guard −1)
3. Pass `routes={routeLines}` and `onRouteSelect={handleRouteSelect}` to `<TripMap>` (line ~468).

### `src/components/trip/TripMap.tsx`

No changes — rendering already exists.

## Behaviour

- 1 variant / 1 unique road → unchanged (simple purple polyline fallback).
- 2-3 unique roads → inactive roads dashed grey + tappable, active road purple.
- Tap a road → selects its fastest variant; strategy switch via existing chips.
- `FitBounds` follows the active road (existing).

## Not changed

Variant chips, cost summary, stop cards, nearby-station context dots.

## Testing

- `npx tsc --noEmit` and `npm run lint` pass.
- Manual: plan a trip with multiple roads → grey alternatives visible, tap
  switches active road + updates chips/stops/cost.
- Single-road trip → no grey lines, identical to before.
