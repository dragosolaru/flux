# Global Vehicle Context — Design Spec
**Date:** 2026-06-22  
**Status:** Approved

---

## Problem

Vehicle selection is handled independently on each page. There is no shared context: switching car on the Documents page does not affect Dashboard or Costs. Pages like dashboard, costs, insights, and charging receive `vehicleId` as a server-side prop (first vehicle from DB), meaning a user with 2 cars has no way to see the second car's data on those pages at all.

Single-vehicle users see no selector anywhere — which is correct — but there is no consistent pattern enforcing this.

---

## Goal

One global vehicle context, persisted across sessions. Single-vehicle users see only their car's name (no selector). Multi-vehicle users get a compact switcher in the sidebar (desktop) and slide-up menu (mobile) that switches all pages simultaneously.

---

## Architecture

### 1. `VehicleContext` — `src/contexts/vehicle.tsx`

Client-side React context. Reads initial value from `localStorage` key `flux:selectedVehicleId`. Falls back to the first vehicle in the `useVehicles()` result if the stored ID is no longer valid (e.g., vehicle deleted).

```ts
interface VehicleContextValue {
  selectedVehicleId: string | undefined;
  setSelectedVehicleId: (id: string) => void;
}
```

Persistence: `useEffect` writes to `localStorage` on every change. On mount, reads from `localStorage` and validates against the live vehicle list before applying.

### 2. Provider placement — `src/app/(dashboard)/layout.tsx`

`VehicleProvider` wraps the dashboard subtree. This is a client boundary — `layout.tsx` imports `"use client"` for the provider wrapper only, keeping the outer layout as a server component via a thin `DashboardLayout` client component.

### 3. Sidebar switcher — `src/components/layout/Sidebar.tsx`

Below the logo row. Behaviour:
- **0 vehicles:** nothing shown
- **1 vehicle:** vehicle name + brand displayed as static text (no interaction)
- **2+ vehicles:** compact styled dropdown showing `nickname ?? displayName`, bound to `setSelectedVehicleId`

### 4. Mobile switcher — `src/components/layout/SlideUpMenu.tsx`

At the top of the slide-up menu (above the grid of nav items). Same logic: hidden for 0–1 vehicles, compact dropdown for 2+.

### 5. Page migration

Pages that currently receive `vehicleId` as a server prop:

| Page | Current | After |
|------|---------|-------|
| `dashboard` | page.tsx fetches first vehicle, passes id | client reads from context |
| `costs` | page.tsx passes vehicleId | client reads from context |
| `insights` | page.tsx passes vehicleId | client reads from context |
| `charging` | page.tsx passes vehicleId | client reads from context |

Migration pattern: client components (`*-client.tsx`) stop accepting `vehicleId` as a prop and call `useVehicleContext()` instead. The `page.tsx` files become thin server components (auth check only, no vehicleId logic).

Pages that already work client-side (`documents`, `trip`, `map`, `energy`) connect directly to context — replace their `vehicles?.[0]?.id` fallback with `selectedVehicleId` from context.

---

## Data Flow

```
localStorage ──► VehicleProvider (mount)
                      │
                 selectedVehicleId
                      │
        ┌─────────────┼──────────────┐
        │             │              │
   Sidebar        SlideUpMenu    all *-client.tsx
   switcher        switcher      pages
        │             │
   setSelectedVehicleId()
        │
   VehicleProvider state update
        │
   localStorage write
        │
   all pages re-render with new vehicleId
```

---

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Stored vehicleId deleted | On mount, validate against vehicle list; fall back to `vehicles[0].id`, update localStorage |
| No vehicles in garage | `selectedVehicleId = undefined`; pages show empty/add-vehicle state |
| First visit (no localStorage) | Defaults to `vehicles[0].id` on first load |
| User adds second vehicle | Switcher appears automatically (reactive to `useVehicles()`) |
| User removes a vehicle that was selected | Falls back to remaining vehicle; if none, `undefined` |

---

## What Does NOT Change

- Single-vehicle users see zero selection UI — only a static name in the sidebar
- The Garage page (`/garage`) lists all vehicles as cards — no context dependency
- The Commands page lists all vehicles — no context dependency
- Charging Map and Map pages are not vehicle-specific — no change needed

---

## Files to Create / Modify

**New:**
- `src/contexts/vehicle.tsx` — context + provider + hook

**Modified:**
- `src/app/(dashboard)/layout.tsx` — add `VehicleProvider`
- `src/components/layout/Sidebar.tsx` — add vehicle switcher block
- `src/components/layout/SlideUpMenu.tsx` — add vehicle switcher at top
- `src/app/(dashboard)/dashboard/page.tsx` + `dashboard-client.tsx`
- `src/app/(dashboard)/costs/page.tsx` + `costs-client.tsx`
- `src/app/(dashboard)/insights/page.tsx` + `insights-client.tsx`
- `src/app/(dashboard)/charging/page.tsx` + `charging-client.tsx`
- `src/app/(dashboard)/documents/documents-client.tsx`
- `src/app/(dashboard)/energy/energy-client.tsx`
- `src/app/(dashboard)/trip/trip-client.tsx`
- `src/app/(dashboard)/map/map-client.tsx`

---

## Non-Goals

- No URL param (`?v=uuid`) — keeps URLs clean
- No server-side cookie — avoids SSR complexity for minimal gain
- No Zustand or other state management library — React context is sufficient
