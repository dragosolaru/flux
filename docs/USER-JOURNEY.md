# Flux — User Journeys & Screen Reference

> Companion to `docs/FEATURES.md` (what is built) and `CODEBASE_CONTEXT.md` (how it is built).
> This file answers: **who uses Flux, how do they move through the app, and what do they see on each screen.**
>
> Kept honest: every journey described here exists in shipped code, not in a roadmap.

**Last updated: 2026-06-11** — reflects the Flux 2027 design system (floating pill nav, onboarding overlay, 3-state map sheet, ambient dashboard tinting, borderless auth inputs).

---

## Table of Contents

1. [Personas](#1-personas)
2. [Journey Map — First 10 Minutes](#2-journey-map--first-10-minutes)
3. [Journey Map — Daily Driver](#3-journey-map--daily-driver)
4. [Journey Map — Road Trip](#4-journey-map--road-trip)
5. [Journey Map — Cost-Conscious Owner](#5-journey-map--cost-conscious-owner)
6. [Journey Map — Pro Upgrade](#6-journey-map--pro-upgrade)
7. [Screen Reference](#7-screen-reference)
8. [Navigation Structure](#8-navigation-structure)
9. [Feature Gates](#9-feature-gates)
10. [PWA Install Flow](#10-pwa-install-flow)
11. [Design System — Flux 2027](#11-design-system--flux-2027)

---

## 1. Personas

| Persona | Description | Primary goal |
|---------|-------------|--------------|
| **New visitor** | Discovers Flux via social/search; no account | Understand the value proposition without committing |
| **Demo user** | Registered but hasn't connected a real Tesla | Explore with mock vehicle; build confidence |
| **Connected owner** | Tesla OAuth done; has live telemetry | See live state; plan trips; track costs |
| **Pro subscriber** | Pays €4.99/mo (or €3.25/mo annual) | Unlimited vehicles, unlimited OCR, full history, AI insights, CSV export |
| **Fleet manager** | Multiple vehicles | Per-vehicle dashboards; aggregate views |

---

## 2. Journey Map — First 10 Minutes

### Step 1 — Landing page (`/`)

The user sees:
- Hero: badge "One app. Every mile." + headline "Your EV. Fully in focus." — two CTAs ("Get started" → `/register`, "Pricing" → `/pricing`)
- Feature strip: live dashboard, trip planner, cost tracking, smart charging
- Bento grid + social proof; positioning leans multi-brand ("Tesla today. More soon.")

**Decision point:** *Get started* → Register flow. Already have account → Login.

> Note: there is no pre-auth demo. The "Explore with demo data" path lives in the post-registration onboarding (add a mock vehicle), so "try it" requires an account first.

---

### Step 2 — Register (`/register`)

Options:
- Google OAuth (one tap, no password needed)
- Email + password form (borderless bottom-line inputs, "flux" wordmark above the form, minimal centered layout)

Copy confirms: *Free during beta — no credit card needed.*

On success → redirect to `/dashboard`.

---

### Step 3 — Onboarding Overlay (new users, first `/dashboard` visit)

Before the dashboard is shown, a **fullscreen 3-screen onboarding overlay** covers the page (`localStorage["flux-onboarding-v2"]` controls visibility). Slides:

1. **Welcome** — "flux" wordmark + brief value prop CTA
2. **Track costs** — cost-tracking pitch with CTA
3. **Plan trips** — trip-planning pitch with CTA

Navigation: advance via CTA buttons; skip via "Skip" link on screens 1–2. On completion or skip the overlay sets `flux-onboarding-v2=done` in localStorage and the user sees the dashboard for the first time.

---

### Step 4 — Dashboard (empty state)

No vehicle yet. The user sees:
- An **empty hero** — SOC placeholder, prompt to add a vehicle
- No checklist card (the overlay has replaced the old Getting Started checklist for new users)

---

### Step 5 — Add Vehicle (modal)

Triggered from the empty hero or **Garage → Add**.

Fields:
- **Model** — dropdown (Model 3, Model Y, Model S, Model X)
- **Year** — dropdown (last 8 model years, computed from the current year)
- **Nickname** — free text (required)
- **VIN (optional)** — auto-detects model + year from a 17-char Tesla VIN
- **Scenario** — radio selection for mock behaviour:
  - **Commuter** — short daily trips, mostly home charging
  - **Weekend errands** — irregular usage pattern
  - **Road trip** — long-distance travel simulation
  - **Vacation** — parked/idle for extended periods

Free tier: max 1 vehicle. Adding more shows a Pro upsell.

On success: success screen → "View vehicle" → `/dashboard?v={vehicleId}`.

---

### Step 6 — Live Dashboard with Mock Data

The user now sees:
- **SOC hero** — battery % in `text-7xl font-thin`, range below in `text-lg font-light text-muted-foreground`; floats directly on the page background with no card chrome
- **Ambient tinting** — `document.body` gains `ambient-charging` / `ambient-low` / `ambient-full` CSS class based on battery state; the page background slowly transitions colour (1.4s ease)
- **Live badge** — pulsates while fetching; refreshes every 30s
- **Stat chips** — power (kW), temperature (°C), odometer (km), charging current, last-charge kWh (horizontal scroll)
- **Quick actions** — `size-9 rounded-full` circular icon-only buttons (Climate, Lock, Charge) with `aria-label`; no text labels
- **Mock banner** — blue strip at top indicating demo data

---

### Step 7 — Connect Real Tesla (optional)

From: settings or garage vehicle menu.

Flow:
1. Click "Connect Tesla" → `/api/tesla/connect`
2. Redirect to Tesla OAuth
3. Grant permissions: read vehicle state, send commands, manage charging, refresh tokens
4. Return to Flux; vehicle now shows **live** data

Note: *Virtual Key must be added via Tesla app → Security → Virtual Keys for commands to work.*

---

## 3. Journey Map — Daily Driver

> Persona: connected owner, checks app every morning before driving.

### Morning check

1. Open app (installed as PWA or browser) → `/dashboard`
2. See battery % and estimated range — ambient body colour hints at charge state (green tint = full, red tint = low)
3. If parked at home with ≥ 80% → no action; close app
4. If parked at home with < 30% → tap circular Climate action (warms battery) + check `/energy` for cheapest charging window

### Charging session start

1. Plugin in → **Charging** tab (bottom nav) → live status card shows power input (kW), current SOC, time to 80%
2. Optional: adjust charge limit slider (default: 80%, slider range: 50–100%)
3. Optional: toggle scheduled charging → set departure time → Tesla will optimise when to start

### After session

1. Session appears in **Recent sessions** list with: duration, kWh added, cost, location
2. Home charging auto-tagged by proximity to configured home address
3. Monthly totals update in `/costs`

---

## 4. Journey Map — Road Trip

> Persona: planning a trip from Florești (Cluj) to Alicante, Spain — ~2 100 km.

### Step 1 — Open the map (`/map` → Plan tab)

Tap the **Map** tab in the floating pill bottom nav. The bottom sheet starts at mid height (44 vh). Tap to the Plan tab.

Form inputs:
- **Origin** — "Florești, Cluj" (typeahead geocoded via Nominatim/TomTom/Photon with **location bias** — origin searches bias toward the user's current GPS position; destination searches bias toward the selected origin)
- **Destination** — "Alicante, Spain"
- **Battery %** — slim custom SOC slider (h-1 track, circular thumb)
- **Options disclosure** (collapsed by default) — arrival SOC target, vehicle selector

Click **Plan route**.

### Step 2 — Review results

After planning, the sheet auto-collapses to 68 px showing a compact summary strip (time · km · stops · cost) so the route polyline is visible. Tap the strip or handle pill to expand to mid or full height.

The planner returns:
- **Total distance** — e.g. 2 012 km
- **Estimated duration** — e.g. 20h 40min (inc. charging breaks + traffic delay)
- **Charging stops** — typically 9–12 stops along route corridor with:
  - Station name + network badge
  - Reliability badge (verified/stale/offline) from OCM
  - SOC on arrival (e.g. 14%) and departure (e.g. 85%)
  - Charging duration (e.g. 28 min at 250 kW Supercharger)
  - Energy added (kWh) and estimated cost (€)
- **Variants** — distinct road alternatives (via ORS/OSRM), each with semantic label: Fastest / Fewest stops / Cheapest; chips show `h m · km · stops · €` for direct comparison
- **Cost comparison** — EV total vs petrol equivalent (user-configurable L/100km + €/L, persisted in localStorage)
- Preconditioning badge on each DC fast-charge stop (auto for Superchargers, amber recommendation for others)

Warning shown if partial route due to coverage gaps.

### Step 3 — Send to Tesla

Click **Send to Tesla** → waypoints + preconditioning commands sent:
- Nav waypoint (next stop or destination) loaded in Tesla navigation
- Battery preconditioning for the first Supercharger stop starts

Success state shows green confirmation banner.

### During trip

The **Charging** tab updates as each stop is visited. The **Car** tab (dashboard) shows live range and position.

---

## 5. Journey Map — Cost-Conscious Owner

> Persona: tracks every charging expense; uploads all receipts; reviews monthly.

### Receipt upload flow

1. `/costs` → FAB (`+` button, bottom-right) → opens upload card
2. Camera icon → take photo of paper receipt, or upload PDF
3. OCR (Claude Vision) extracts:
   - Total cost (RON/EUR/other)
   - Energy (kWh)
   - Date
   - Network name
4. Extracted data shown inline — user can correct any field
5. Saved → cost entry appears in timeline

### WhatsApp receipt inbox

1. Settings → expand "Advanced" section → configure WhatsApp number
2. When charging at a public station that sends a WhatsApp receipt:
   - Forward message to Flux WhatsApp inbox
   - System auto-extracts cost + kWh
   - Appears in `/costs` document list with status "processing" → "done"

### Monthly review

1. `/costs` → monthly chart (last 12 months bar chart)
2. KPI strip: cost/km · home vs public split · total kWh · efficiency (Wh/km) · fuel savings
3. Document list: filter by month; inline edit if OCR made a mistake
4. **Export CSV** (Pro) → download `flux_costs_YYYY-MM.csv` with all entries

---

## 6. Journey Map — Pro Upgrade

> Triggered when: user tries to add a 2nd vehicle, or exceeds the free monthly document limit (6th energy document, or 11th vehicle/car document).

### Upgrade gate

- A **lock icon (✦)** appears on gated items
- Clicking a gated feature shows an inline upgrade card:
  - Current plan (Free) vs Pro (€4.99/month)
  - Feature list comparison
  - **Upgrade button** → Stripe Checkout

### Stripe checkout

1. Stripe-hosted payment page (card, Google Pay, Apple Pay)
2. On success → Stripe webhook → Flux marks user as `pro`
3. Redirect back to app; lock icons disappear; all features unlocked

### Manage subscription

1. `/settings` → expand "Account & Billing" section
2. **Manage plan** button → Stripe Customer Portal
3. Change card, cancel, view invoices — all handled by Stripe; no sensitive data in Flux DB

---

## 7. Screen Reference

Each screen is listed with its route, primary content blocks, and the most common user action.

---

### `/` — Landing

| Block | Content |
|-------|---------|
| Hero | Badge "One app. Every mile." + headline "Your EV. Fully in focus." + Get started / Pricing CTAs |
| Social proof | Charging-station count, languages, free-to-start, setup time |
| Features | Alternating feature blocks (vehicle control, cost, trip) + bento grid |
| Footer | Links, language selector |

**Most common action:** Click "Get started" → `/register`

---

### `/login` — Sign In

| Block | Content |
|-------|---------|
| "flux" wordmark | Tagline centered above form |
| Google button | One-tap OAuth |
| Email form | Borderless bottom-line inputs (`auth-input` class), micro-labels above fields |
| Error state | "Invalid email or password" inline |
| Footer | "New here?" → `/register` (inline `·` separator) |

---

### `/register` — Create Account

| Block | Content |
|-------|---------|
| "flux" wordmark | Tagline centered above form |
| Google button | One-tap OAuth |
| Email form | Borderless bottom-line inputs, micro-labels |
| Trust copy | "Free during beta — no credit card needed" |
| Footer | "Already have account?" → `/login` (inline `·` separator) |

---

### `/dashboard` — Vehicle Dashboard

| Block | Content |
|-------|---------|
| OnboardingOverlay | 3-screen fullscreen overlay (new users only, once) |
| Mock banner | Blue strip (only for demo vehicles) |
| SOC hero | Battery % (`text-7xl font-thin`), range (`text-lg font-light`), no card chrome |
| Ambient tinting | Body background shifts: green (≥80%), red (≤20%), blue (charging) |
| Stat chips | kW · °C · km · A · last-charge kWh (horizontal scroll) |
| Quick actions | Circular icon-only buttons (`size-9 rounded-full`): Climate · Lock · Charge |
| Charging overlay | If active: SOC bar, power, time to target |
| Vehicle cards | Battery health, tires, doors/windows, scores, software, weather range |
| Pull-to-refresh | Drag down (mobile) → immediate refetch |

**Most common action:** Check battery on arrival / departure

---

### `/garage` — Fleet

| Block | Content |
|-------|---------|
| Add Vehicle button | Opens modal |
| Vehicle cards | Nickname, model, last seen, tariff hint |
| Fleet totals | Count of vehicles, aggregate range |
| Card menu | Deactivate / Reactivate / Delete |

---

### `/charging` — Charging Status

| Block | Content |
|-------|---------|
| Live status | Power (kW), SOC, time to target |
| Charge limit slider | 50–100%, recommended 80% |
| Scheduled charging | Toggle + time picker |
| Recent sessions | List: date, duration, kWh, cost, location tag |
| Sync button | Fetch history from Tesla |

---

### `/insights` — Insights

Per-vehicle analytics with a period selector (7d / 30d / 1y / all) that filters all sections.

| Block | Content |
|-------|---------|
| Savings | EV vs petrol savings, CO₂ avoided (trees equivalent) |
| Activity | Distance, energy, session counts |
| Battery health | SoH trend over time |
| Efficiency | Wh/km from personal consumption |

---

### `/documents` — Document Vault

Per-vehicle store of car documents (RCA, CASCO, ITP, rovinieta, vignette, tolls, car tax, talon, service, parking…). OCR auto-classifies uploads and extracts plate, validity dates, issuer, amount.

| Block | Content |
|-------|---------|
| Coverage Shield | SVG ring: % of mandatory RO docs (RCA, ITP, rovinieta) present and valid |
| Calendar export | Download all expiry dates as `.ics` (30-day + 7-day alarms) |
| FAB / upload | Add document (file upload or manual entry) |
| Document list | Cards with expiry status, insolvent-insurer warning, RCA renewal link |

---

### `/energy` — Smart Charging

| Block | Content |
|-------|---------|
| Smart charge card | Connected? · SOC below limit? · schedule button |
| Price curve | 24-bar chart, cheapest window highlighted |
| Current rate | €/kWh, provider name |
| Cheapest window | Start–end time + projected savings |
| Departure section | Time picker, preconditioning toggle (Virtual Key required) |

---

### `/map` — Unified Map

Full-screen map with a **3-state draggable bottom sheet**. The handle pill at the top of the sheet advances through states on tap; dragging also snaps to the nearest state.

| Sheet state | Height | Contents |
|-------------|--------|---------|
| Collapsed | 68 px | Summary strip: nearest station or active trip (time · km · stops · cost) |
| Mid | 44 vh | Explore mode: filter chips + station list; Plan mode: form + results |
| Full | 90 dvh | Full detail list or full trip results |

#### Explore tab
| Block | Content |
|-------|---------|
| Full-screen map | CARTO Voyager tiles; clustered station pins |
| Filter chips | Compact `h-7 text-xs` pills: power tier + connector type |
| Station count badge | Live count, pulsates while loading; "Looking for stations…" in cold areas |
| Station tap | Opens detail sheet; map stays interactive |
| Locate me | Centers map on user position |

#### Plan tab
| Block | Content |
|-------|---------|
| Origin / Destination | Geocoding search with typeahead + location bias (origin → user GPS; destination → origin point) |
| Battery % sliders | Slim custom track (h-1), circular thumb; Current SOC + arrival SOC target |
| Options disclosure | Collapsed by default: vehicle selector, arrival SOC |
| Plan button | `h-11 rounded-[10px]` primary CTA |
| Results summary | Distance · time · stops · cost (compact strip in collapsed sheet) |
| Stop list | Expandable list of charging stops with network + reliability badges |
| Variant chips | Distinct road alternatives; semantic badges: Fastest / Fewest stops / Cheapest |
| Tab switcher | Underline style with Framer Motion indicator |

---

### `/charging-map` — Station Map

| Block | Content |
|-------|---------|
| Full-screen map | CARTO Voyager tiles; clustered station bubbles |
| Filter chips | Power (All/50+/150+/350 kW) + connector (Type 2/CCS/CHAdeMO/Tesla) |
| Station count badge | Live count with ingestion status; cold-area polling indicator |
| Detail sheet | Name, address, connectors, availability badge (operational/stale/offline/unknown) |
| List sheet | Bottom sheet: in-view stations sorted by distance + debounced search |
| Locate me | GPS centering |

---

### `/trip` — Trip Planner

Standalone trip planner. Same planning logic as Map → Plan tab.

| Block | Content |
|-------|---------|
| Route form | Origin + destination with typeahead + location bias; Options disclosure (battery %, vehicle, arrival SOC) |
| Plan variants | Distinct road alternatives with semantic badges (Fastest / Fewest stops / Cheapest) |
| Results | Distance, duration, stop cards with reliability badges |
| Fuel comparison | EV vs petrol cost (user-configurable via inline inputs, persisted in localStorage) |
| Send to Tesla | Share route + preconditioning |
| Recent destinations | Last 5 destinations (localStorage, LIFO, deletable) |

---

### `/costs` — Cost Tracking

| Block | Content |
|-------|---------|
| KPI strip | Cost/km · home split · total kWh · efficiency · fuel savings (horizontal scroll) |
| Monthly chart | 12-month bar chart, home vs public colour split |
| FAB | `+` button (bottom-right, `bottom-24 right-4`) opens upload/ingest card |
| Document list | Timeline-style: coloured dot+line per status; inline edit · delete |
| Export CSV | Pro feature |

---

### `/commands` — Remote Control

| Block | Content |
|-------|---------|
| Vehicle selector | Dropdown |
| Action grid | 2-column grid: Lock · Unlock · Climate On · Climate Off · Honk · Flash Lights |
| Command status | Optimistic UI (instant state change) → success/error toast on server response |
| Virtual Key hint | Shown if commands not pairing |

---

### `/settings` — Preferences

Settings uses **collapsible sections** with progressive disclosure. Section collapse state persists to localStorage.

| Section | Collapsed by default | Key settings |
|---------|---------------------|-------------|
| Preferences | No | Language (EN/RO/DE/FR/HU), currency display, Install app |
| Location | No | Address + geocode verify |
| Energy tariff | No | Provider, hourly rate, Tibber |
| Notifications | No (shown only when notifications flag is enabled) | Push subscription + per-event preferences |
| Vehicles | No | List · scenario switcher (mock) · deactivate · inactive vehicles list |
| Account & Billing | Yes | Name, email, current plan, Upgrade CTA, Manage via Stripe Portal, GDPR export, delete account |
| Advanced | Yes | WhatsApp number, charger network health stats |

All inputs use `auth-input` (borderless bottom-line style). No colored icon circles — bare monochrome icons only.

---

### `/about-data` — Transparency

| Block | Content |
|-------|---------|
| Per-vehicle section | Live vs demo status for each data category |
| Platform services | Tariff · Network · Weather · Routing — all labelled demo/live |
| Explanation footer | What "live" means and how to connect |

---

### `/pricing` — Product Page

> Nav label reads "Product". This is a full product presentation (hero, brand bar, feature explainers, roadmap, pricing, trust strip, FAQ, feedback form), not a bare pricing table.

| Block | Content |
|-------|---------|
| Free tier | Features list: 1 vehicle, 5 energy + 10 vehicle docs/month, 30-day history, all planning tools |
| Pro tier | Monthly/annual toggle (€4.99/mo or €3.25/mo annual); unlimited vehicles + docs, full history, AI insights |
| Upgrade CTA | → Stripe Checkout |

---

## 8. Navigation Structure

### Bottom Navigation (mobile — floating pill)

The bottom nav is a **centered floating pill** that auto-hides when scrolling down and reappears when scrolling up or reaching the top. It sits `14px + env(safe-area-inset-bottom)` from the screen bottom.

| Tab | Route | Notes |
|-----|-------|-------|
| Car | `/dashboard` | Vehicle state |
| Map | `/map` | Unified map + trip planner |
| Charging | `/charging` | Charging sessions |
| More | Slide-up sheet | Secondary destinations |

Tapping the active tab scrolls the page back to the top.

#### More sheet (SlideUpMenu)

A glass slide-up sheet with a **2-column grid of compact monochrome tiles** (no colored icon circles). Order in `SlideUpMenu.tsx`:

| Tile | Route |
|------|-------|
| Insights | `/insights` |
| Documents | `/documents` |
| Costs | `/costs` |
| Energy | `/energy` |
| Charging map | `/charging-map` |
| Commands | `/commands` |
| Settings | `/settings` |
| About data | `/about-data` |

Drag down or tap X to dismiss.

### Sidebar (desktop, `md:` breakpoint)

**Car**
- Garage → `/garage`
- Dashboard → `/dashboard`
- Charging → `/charging`
- Insights → `/insights`
- Documents → `/documents`
- Commands → `/commands`

**Money & Energy**
- Costs → `/costs`
- Energy → `/energy`
- Charging Map → `/charging-map`

**Planning**
- Map → `/map`
- Trip Planner → `/trip`

**Footer**
- Settings → `/settings`
- About Data → `/about-data`

Lock icon (✦) on items below the user's current capability: Dashboard, Charging, Insights, Documents, Costs, Trip (VEHICLE); Energy (TARIFF); Commands (COMMANDS). Garage, Charging Map, Map, Settings, About Data require no capability.

---

## 9. Feature Gates

Flux uses a capabilities model. Each capability is derived server-side from the user's vehicle and subscription state.

| Capability | Required for | How to unlock |
|-----------|-------------|---------------|
| `VEHICLE` | Dashboard live data, Charging status, Commands | Connect real Tesla **or** add mock vehicle |
| `TARIFF` | Energy smart charging page | Configure energy provider in Settings |
| `COMMANDS` | Remote lock/unlock/climate | Virtual Key paired in Tesla app |
| `PRO` | 2nd+ vehicle, exceeding the free monthly document limits (5 energy / 10 vehicle docs), CSV export, WhatsApp/email inbox | Subscribe at `/pricing` → Stripe |

In the UI, gated features show a **✦ lock icon**. Attempting to use a gated feature shows an inline upgrade card.

---

## 10. PWA Install Flow

Flux is installable as a Progressive Web App.

### Android / Chrome (automatic prompt)
1. App shows an **Install banner** (bottom of screen, above bottom nav)
2. Banner reads: "Install Flux · Add to Home Screen"
3. Tap Install → browser installs as standalone app
4. Banner dismissed forever after install (or snoozed if dismissed)

### iOS / Safari (manual)
1. App shows a soft hint: "Tap **Share** → **Add to Home Screen**"
2. Hint auto-hides after 7 days if dismissed
3. User follows system flow manually

### Post-install behaviour
- Opens in **standalone mode** (no browser chrome)
- Service worker caches app shell + last `/dashboard` visit
- Offline: shows cached data with stale indicator
- Updates: service worker refreshes on next network connection
- **Map screens**: bottom sheet anchored above the floating pill nav (standalone-mode CSS offset); Leaflet attribution and controls lifted above the home indicator; iOS rubber-band over-scroll disabled
- **Sheet state after drag**: snapped sheet state is preserved so the nav offset applies correctly after a drag release

### Install button in Settings
`/settings` → Esențial section → "Install app" row (only shown if not already installed or on iOS).

---

## 11. Design System — Flux 2027

The 2027 design language applies across the entire app. Key principles:

### Ambient numbers
Hero stats (battery %, range, score numbers, tire pressures) use `font-thin` (`font-weight: 100`). They float on the bare page background with no card chrome. The dashboard SOC is `text-7xl font-thin tracking-tight`.

### Floating pill nav
The bottom nav is a pill-shaped floating element centered above the home indicator. It auto-hides on scroll down, returns on scroll up. Four tabs only (Car / Map / Charging / More) — secondary destinations live in the More grid.

### Monochrome icons
All icons throughout the app are `text-muted-foreground` (no colored circles). Section labels use `text-[10px] tracking-[0.12em] uppercase text-muted-foreground/50`.

### Auth input pattern
Text inputs (login, register, settings, modals) use `.auth-input`: borderless with only a bottom border-line, uppercase micro-label above. No rounded box border.

### 3-state bottom sheet (map)
The map sheet has three discrete snap heights: 68 px (collapsed summary) → 44 vh (mid / form) → 90 dvh (full). The handle pill clicks through these states; drag snaps to nearest.

### Collapsible settings
Long settings pages use collapsible sections (Account & Billing, Advanced) to reduce initial scroll depth. Row height `min-h-[44px]`, section headers near-invisible structural markers.

### Ambient body tinting (dashboard)
`document.body` gains a CSS class based on battery state: `ambient-full` (≥80%), `ambient-low` (≤20%), `ambient-charging` (charging active). A 1.4s `background-color` transition in `globals.css` creates a slow ambient colour shift. Classes clean up on component unmount.

### Button sizing
Primary buttons: `h-11 rounded-[10px]`. Secondary/icon: `h-10 rounded-[10px]`. Circular quick-action buttons: `size-9 rounded-full`. Touch minimum: 44px.

---

*Last updated: 2026-06-11. Covers all shipped features as of the Flux 2027 design system.*
