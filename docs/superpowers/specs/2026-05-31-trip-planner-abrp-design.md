# Trip Planner — ABRP-style Design Spec

**Date:** 2026-05-31  
**Status:** Approved  
**Scope:** ABRP-like EV trip planner with real routing, geocoding, and cost estimation

---

## 1. Goal

Replace the current city-dropdown trip planner with a full-screen ABRP-style experience: free text search, real road routing via OSRM, automatic charging stop placement, and per-stop cost estimation. The user's Tesla SOC pre-fills from live data when available.

---

## 2. Non-goals

- No React Native / native app — web-only PWA
- No real-time station availability — static station DB is sufficient for MVP
- No route re-calculation mid-trip (navigation mode)
- No multi-vehicle comparison

---

## 3. Architecture

### 3.1 New backend files

| File | Purpose |
|---|---|
| `src/app/api/geocode/route.ts` | Proxy Nominatim search (avoids CORS, adds User-Agent header) |
| `src/lib/external/routing/providers/osrm-router.ts` | OSRM public API integration with haversine fallback |

### 3.2 Modified backend files

| File | Change |
|---|---|
| `src/lib/external/routing/planner.ts` | Accept OSRM distances + return polyline GeoJSON in response |
| `src/app/api/trip-plan/route.ts` | Accept `{origin,destination}` as `{lat,lng}` coords (not city name); accept `startSoc`; return polyline |

### 3.3 New frontend components

| File | Purpose |
|---|---|
| `src/components/trip/TripMap.tsx` | Leaflet full-screen map with route polyline + station markers |
| `src/components/trip/GeocodingSearch.tsx` | Autocomplete input (debounce 500ms → /api/geocode) |
| `src/components/trip/StopCard.tsx` | Single charging stop: network, kWh added, cost, arrival SOC, duration |
| `src/components/trip/CostSummary.tsx` | Trip header: total km, duration, kWh, cost. Fuel comparison toggle. |

### 3.4 Modified frontend files

| File | Change |
|---|---|
| `src/app/(dashboard)/trip/trip-client.tsx` | Full rewrite — ABRP-style layout |
| `src/components/trip/TripPlanResult.tsx` | Replaced by StopCard + CostSummary composition |

---

## 4. UI Layout

Full-screen map (Leaflet, OSM tiles) with two overlays:

**Top overlay — search form (always visible):**
```
[ 🔍 De la: text input with autocomplete ]
[ 🏁 Către: text input with autocomplete ]
[ 🔋 Baterie: slider 10–100% ] [Planifică →]
```

Battery slider pre-fills from `useLiveVehicle()` when vehicle is connected. Falls back to 80% default with manual override always available.

**Bottom panel — results (slide up after plan is computed):**
- Sticky header: origin → destination, total time, stops count, total kWh, total cost
- Vertical list of StopCards with connecting route lines
- Footer: "Cât ar costa cu benzină?" toggle button → modal with fuel cost comparison

**Map layer:**
- Blue polyline: full route geometry from OSRM
- Green marker: origin
- Red marker: destination  
- Yellow lightning markers: charging stops (click → StopCard popover)

---

## 5. Data Flow

### Geocoding
```
User types → 500ms debounce → GET /api/geocode?q=... 
  → proxy → Nominatim /search?format=json&limit=5
  → [{display_name, lat, lng}] → autocomplete dropdown
```

Rate limiting: Nominatim ToS requires 1 req/sec max — debounce + server-side caching satisfies this.

### Trip planning
```
POST /api/trip-plan {
  origin: { lat: number, lng: number, name: string },
  destination: { lat: number, lng: number, name: string },
  startSoc: number,        // 10–100
  vehicleId: string | null // for efficiency lookup
}

Response {
  stops: [{
    station: { id, name, network, lat, lng, pricePerKwh, currency },
    arrivalSoc: number,
    departSoc: number,
    kwhAdded: number,
    cost: number,
    durationMin: number,
    distanceFromPrevKm: number
  }],
  totalCost: number,
  totalKwh: number,
  totalDistanceKm: number,
  durationMin: number,       // drive time only
  polyline: GeoJSON.LineString
}
```

### Planner algorithm (greedy forward pass)
1. Get full route geometry from OSRM
2. Walk forward in distance increments
3. At each point, estimate SOC using `vehicle.wh_per_km` (or 180 Wh/km default)
4. When estimated arrival SOC at next waypoint < 15%, find nearest station within 20km of route
5. Recharge to 80% (fast DC optimal), compute cost
6. Continue until destination

### OSRM integration
- Endpoint: `https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson`
- Returns: `distance` (meters), `duration` (seconds), `geometry` (GeoJSON LineString)
- Fallback: if OSRM times out (>5s) or returns error, use haversine×1.25 with warning banner

### Fuel comparison (on-demand)
- Triggered by button click, shown in modal
- Calculation: `(totalDistanceKm / 100) × 8L × fuelPricePerLiter`
- Fuel price: from user locale settings if available, else €1.65/L default
- Savings: `fuelCost - totalEvCost`

---

## 6. API Route: GET /api/geocode

```typescript
// Auth: not required (public OSM data)
// Rate limit: 20 req/min per IP (checkRateLimit applied with userId or IP)
// Query: ?q=<search string>
// Response: { results: [{name: string, lat: number, lng: number}] }
```

Nominatim requires `User-Agent` header — set to `Flux-TripPlanner/1.0 (contact@daolab.io)`.

---

## 7. i18n keys (all 5 locales)

```json
"trip": {
  "page_title": "Planificator",
  "from_placeholder": "De unde pleci?",
  "to_placeholder": "Unde mergi?",
  "battery_label": "Baterie curentă",
  "plan_btn": "Planifică traseul",
  "planning": "Se calculează…",
  "no_stops": "Bateria este suficientă — fără opriri necesare",
  "no_route": "Nu s-a putut calcula traseul. Verifică locațiile.",
  "no_stations": "Nu există stații de încărcare pe acest traseu",
  "approx_route_warning": "Rută aproximativă (OSRM indisponibil)",
  "stop_arrive": "Ajungi cu",
  "stop_charge": "Încarci",
  "stop_duration": "Durată",
  "stop_cost": "Cost",
  "summary_stops": "opriri",
  "summary_kwh": "kWh",
  "fuel_compare_btn": "Cât ar costa cu benzină?",
  "fuel_compare_title": "Comparație cu benzină",
  "fuel_ev_cost": "Cost EV",
  "fuel_petrol_cost": "Cost benzină",
  "fuel_savings": "Economii",
  "fuel_close": "Închide"
}
```

---

## 8. Error states

| Condition | UI response |
|---|---|
| Geocoding 0 results | "Locația nu a fost găsită" inline under input |
| OSRM timeout (>5s) | Fallback to haversine + yellow banner "Rută aproximativă" |
| No stations on route | Full-page state: icon + "Nu există stații pe acest traseu" |
| Route < 80km | Info card: "Bateria suficientă pentru traseu direct, fără opriri" |
| API error 5xx | Retry button + "Eroare de server, încearcă din nou" |

---

## 9. Security

- `/api/geocode` — rate limit 20 req/min by `userId` (or hashed IP for unauthenticated)
- `/api/trip-plan` — existing auth check + rate limit 20/hr (already in route.ts)
- No user data stored for trips (stateless — trip plans are ephemeral)
- Nominatim: no API key needed, no PII sent (only search string)

---

## 10. Testing

- Unit: `planner.ts` with mock OSRM response → verify stop placement, SOC accounting
- Unit: `osrm-router.ts` with mock fetch → verify fallback on timeout
- Integration: `POST /api/trip-plan` with București→Cluj coords → expect ≥1 stop in Sibiu area
- Visual: map renders, polyline visible, markers clickable
