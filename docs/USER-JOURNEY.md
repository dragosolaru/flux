# Flux — User Journeys & Screen Reference

> Companion to `docs/FEATURES.md` (what is built) and `CODEBASE_CONTEXT.md` (how it is built).
> This file answers: **who uses Flux, how do they move through the app, and what do they see on each screen.**
>
> Kept honest: every journey described here exists in shipped code, not in a roadmap.

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

---

## 1. Personas

| Persona | Description | Primary goal |
|---------|-------------|--------------|
| **New visitor** | Discovers Flux via social/search; no account | Understand the value proposition without committing |
| **Demo user** | Registered but hasn't connected a real Tesla | Explore with mock vehicle; build confidence |
| **Connected owner** | Tesla OAuth done; has live telemetry | See live state; plan trips; track costs |
| **Pro subscriber** | Pays €4.99/month | Unlimited vehicles, unlimited OCR, CSV export |
| **Fleet manager** | Multiple vehicles | Per-vehicle dashboards; aggregate views |

---

## 2. Journey Map — First 10 Minutes

### Step 1 — Landing page (`/`)

The user sees:
- Hero: "Flux · Smart EV companion" — tagline, two CTAs (Start free / See demo)
- Feature strip: live dashboard, trip planner, cost tracking, smart charging
- Pricing teaser: Free vs Pro tiers with highlighted differences

**Decision point:** *Create account* → Register flow. Already have account → Login.

---

### Step 2 — Register (`/register`)

Options:
- Google OAuth (one tap, no password needed)
- Email + password form

Copy confirms: *Free during beta — no credit card needed.*

On success → redirect to `/dashboard`.

---

### Step 3 — Dashboard (empty state)

No vehicle yet. The user sees:
- An **empty hero card** with prompt to add a vehicle
- A **"Getting Started" checklist card** (4 steps, none complete):
  1. ⬜ Add a vehicle — links to garage/add modal
  2. ⬜ Upload a receipt — links to `/costs`
  3. ⬜ Set home location — links to `/settings#home-location`
  4. ⬜ Explore demo mode — links to `/garage`

---

### Step 4 — Add Vehicle (modal)

Triggered from the checklist or from **Garage → Add**.

Fields:
- **Model** — dropdown (Model 3, Model Y, Model S, Model X)
- **Year** — dropdown (2018–2025)
- **Nickname** — free text (required)
- **Scenario** — radio selection for mock behaviour:
  - **Commuter** — short daily trips, mostly home charging
  - **Weekend errands** — irregular usage pattern
  - **Road trip** — long-distance travel simulation
  - **Vacation** — parked/idle for extended periods

Free tier: max 1 vehicle. Adding more shows a Pro upsell.

On success: success screen → "View vehicle" → `/dashboard?v={vehicleId}`.

---

### Step 5 — Live Dashboard with Mock Data

The user now sees:
- **Battery ring** — SOC %, range in km
- **Status** — charging / driving / parked / preconditioned
- **Live badge** — pulsates while fetching; refreshes every 30s
- **Stat chips** — power (kW), temperature (°C), odometer (km), charging current
- **Quick actions** — Lock, Unlock, Climate On/Off, Honk, Flash (mock engine simulates responses)
- **Mock banner** — blue strip at top indicating demo data

The checklist step 1 (Add vehicle) now shows ✅.

---

### Step 6 — Connect Real Tesla (optional)

From: onboarding card, settings, or garage vehicle menu.

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
2. See battery % and estimated range → decide if top-up needed
3. If parked at home with ≥ 80% → no action; close app
4. If parked at home with < 30% → tap "Climate On" (warms battery) + check `/energy` for cheapest charging window

### Charging session start

1. Plugin in → `/charging` → live status card shows power input (kW), current SOC, time to 80%
2. Optional: adjust charge limit slider (default: 80%, slider range: 50–100%)
3. Optional: toggle scheduled charging → set departure time → Tesla will optimise when to start

### After session

1. Session appears in **Recent sessions** list with: duration, kWh added, cost, location
2. Home charging auto-tagged by proximity to configured home address
3. Monthly totals update in `/costs`

---

## 4. Journey Map — Road Trip

> Persona: planning a trip from Florești (Cluj) to Alicante, Spain — ~2 100 km.

### Step 1 — Plan route (`/trip` or `/map` → Plan tab)

Form inputs:
- **Origin** — "Florești, Cluj" (geocoded via Nominatim)
- **Destination** — "Alicante, Spain"
- **Battery %** — slider, current SOC (e.g. 87%)
- **Vehicle** — selected automatically if only one vehicle

Click **Plan route**.

### Step 2 — Review results

The planner returns:
- **Total distance** — e.g. 2 012 km
- **Estimated duration** — e.g. 20h 40min (inc. charging breaks + traffic delay)
- **Charging stops** — typically 9–12 stops along route corridor with:
  - Station name + network
  - SOC on arrival (e.g. 14%) and departure (e.g. 85%)
  - Charging duration (e.g. 28 min at 250 kW Supercharger)
  - Energy added (kWh) and estimated cost (€)
- **Variants** — Fastest / Fewest stops / Cheapest (toggle between)
- **Cost comparison** — EV total vs petrol equivalent (configurable L/100km + €/L)

Warning shown if partial route due to coverage gaps.

### Step 3 — Send to car

Click **Send to Tesla** → route + preconditioning commands sent to car:
- Nav waypoints loaded in Tesla navigation
- Battery preconditioning for first Supercharger stop starts

Success state shows green confirmation banner.

### During trip

The `/charging` screen updates as each stop is visited. `/dashboard` shows live range and position.

---

## 5. Journey Map — Cost-Conscious Owner

> Persona: tracks every charging expense; uploads all receipts; reviews monthly.

### Receipt upload flow

1. `/costs` → **Add receipt** button
2. Camera icon → take photo of paper receipt, or upload PDF
3. OCR (Claude Vision) extracts:
   - Total cost (RON/EUR/other)
   - Energy (kWh)
   - Date
   - Network name
4. Extracted data shown inline — user can correct any field
5. Saved → cost entry appears in timeline

### WhatsApp receipt inbox (Pro)

1. Settings → Notifications → configure WhatsApp number
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

> Triggered when: user tries to add 2nd vehicle, tries to export CSV, or uploads 4th document in month.

### Upgrade gate

- A **lock icon (✦)** appears on gated nav items and feature buttons
- Clicking a gated feature shows an inline upgrade card:
  - Current plan (Free) vs Pro (€4.99/month)
  - Feature list comparison
  - **Upgrade button** → Stripe Checkout

### Stripe checkout

1. Stripe-hosted payment page (card, Google Pay, Apple Pay)
2. On success → Stripe webhook → Flux marks user as `pro`
3. Redirect back to app; lock icons disappear; all features unlocked

### Manage subscription

1. `/settings` → Billing section
2. **Manage plan** button → Stripe Customer Portal
3. Change card, cancel, view invoices — all handled by Stripe; no sensitive data in Flux DB

---

## 7. Screen Reference

Each screen is listed with its route, primary content blocks, and the most common user action.

---

### `/` — Landing

| Block | Content |
|-------|---------|
| Hero | Tagline, Start free CTA, screenshot |
| Features | 4-panel grid (dashboard, trip, costs, smart charging) |
| Pricing teaser | Free vs Pro comparison table |
| Footer | Links, language selector |

**Most common action:** Click "Start free" → `/register`

---

### `/login` — Sign In

| Block | Content |
|-------|---------|
| Google button | One-tap OAuth |
| Email form | Email + password + submit |
| Error state | "Invalid email or password" inline |
| Footer | "New here?" → `/register` |

---

### `/register` — Create Account

| Block | Content |
|-------|---------|
| Google button | One-tap OAuth |
| Email form | Email + password |
| Trust copy | "Free during beta — no credit card needed" |
| Footer | "Already have account?" → `/login` |

---

### `/dashboard` — Vehicle Dashboard

| Block | Content |
|-------|---------|
| Getting Started card | Checklist (only while steps incomplete, dismissible) |
| Mock banner | Blue strip (only for demo vehicles) |
| HeroCard | Battery %, range, live badge, charging ring |
| Stat chips | kW · °C · km · A (scrollable row) |
| Quick actions | Lock · Unlock · Climate · Honk · Flash |
| Charging overlay | If active: SOC bar, power, time to target |
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

Two modes, toggled via tab bar inside the sheet:

#### Explore tab
| Block | Content |
|-------|---------|
| Full-screen map | Cluster pins → individual station pins |
| Filter toggle pill | Power / connector filter chips |
| Station count badge | Live count, pulsates while loading |
| Station tap | Opens detail sheet: name, power, connectors, availability |
| Locate me | Centers map on user position |

#### Plan tab
| Block | Content |
|-------|---------|
| Origin / Destination | Geocoding search with typeahead |
| Battery % sliders | Current SOC + target arrival SOC |
| Vehicle selector | Dropdown if multi-vehicle |
| Plan button | Triggers route computation |
| Results summary | Distance · time · stops · cost (compact strip) |
| Stop list | Expandable list of charging stops |
| Route on map | Polyline + stop markers stay visible while reading results |

---

### `/charging-map` — Station Map

| Block | Content |
|-------|---------|
| Full-screen map | Cluster bubbles → individual pins |
| Filter toggle | Power (50kW+, fast, slow) + connector (Type 2, CCS, Tesla) |
| Station count badge | Live count with ingestion status |
| Detail sheet | Name, address, connectors, availability badge, last verified |
| Locate me | GPS centering |

---

### `/trip` — Trip Planner (legacy)

Standalone trip planner (pre-dates `/map`). Same form as Map → Plan tab.

| Block | Content |
|-------|---------|
| Route form | Origin, destination, battery %, vehicle |
| Plan variants | Fastest · Fewest stops · Cheapest |
| Results | Distance, duration, stop cards |
| Fuel comparison | EV vs petrol cost (configurable) |
| Send to Tesla | Share route + preconditioning |
| Recent searches | Last 5 routes |

---

### `/costs` — Cost Tracking

| Block | Content |
|-------|---------|
| KPI strip | Cost/km · home split · total kWh · efficiency · fuel savings |
| Monthly chart | 12-month bar chart, home vs public colour split |
| Add receipt | Upload photo/PDF → OCR |
| Document list | Status · extracted data · inline edit · delete |
| Export CSV | Pro feature |

---

### `/commands` — Remote Control

| Block | Content |
|-------|---------|
| Vehicle selector | Dropdown |
| Action grid | Lock · Unlock · Climate On · Climate Off · Honk · Flash Lights |
| Command status | Spinner → success/error toast |
| Virtual Key hint | Shown if commands not pairing |

---

### `/settings` — Preferences

| Section | Key settings |
|---------|-------------|
| Preferences | Language (EN/RO/DE/FR/HU), currency display |
| Home location | Address + geocode verify (used for charging location tagging) |
| Tariff | Energy provider, hourly rate, or live Tibber integration |
| Notifications | WhatsApp number (Pro), email inbox (Pro) |
| Vehicles | List · deactivate · delete · scenario switcher (mock only) |
| Billing | Current plan, Upgrade CTA, Manage via Stripe Portal |
| Account | Name, email, export all data (GDPR), delete account |
| Charger network | Station count statistics |
| Virtual Key | Setup guide link |

---

### `/about-data` — Transparency

| Block | Content |
|-------|---------|
| Per-vehicle section | Live vs demo status for each data category |
| Platform services | Tariff · Network · Weather · Routing — all labelled demo/live |
| Explanation footer | What "live" means and how to connect |

---

### `/pricing` — Pricing Page

| Block | Content |
|-------|---------|
| Free tier | Features list: 1 vehicle, 3 docs/month, all planning tools |
| Pro tier (€4.99/mo) | Unlimited vehicles + docs, CSV export, email/WhatsApp inbox, battery health |
| Upgrade CTA | → Stripe Checkout |

---

## 8. Navigation Structure

### Bottom Navigation (mobile, always visible)

| Tab | Route | Gate |
|-----|-------|------|
| Dashboard | `/dashboard` | VEHICLE capability |
| Charging | `/charging` | VEHICLE capability |
| Map | `/map` | None |
| More | Slide-up menu | None |

Locked tabs show a lock icon (✦) if the vehicle capability is absent (no vehicle connected or only inactive vehicles).

### Sidebar (desktop, `md:` breakpoint)

**Car**
- Garage → `/garage`
- Dashboard → `/dashboard`
- Charging → `/charging`
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

Lock icon (✦) on: Dashboard, Charging, Commands (VEHICLE), Costs (VEHICLE), Energy (TARIFF), Commands (COMMANDS).

---

## 9. Feature Gates

Flux uses a capabilities model. Each capability is derived server-side from the user's vehicle and subscription state.

| Capability | Required for | How to unlock |
|-----------|-------------|---------------|
| `VEHICLE` | Dashboard live data, Charging status, Commands | Connect real Tesla **or** add mock vehicle |
| `TARIFF` | Energy smart charging page | Configure energy provider in Settings |
| `COMMANDS` | Remote lock/unlock/climate | Virtual Key paired in Tesla app |
| `PRO` | 2nd+ vehicle, 4th+ doc upload, CSV export, WhatsApp/email inbox | Subscribe at `/pricing` → Stripe |

In the UI, gated features show a **✦ lock icon** on sidebar items. Attempting to use a gated feature (add 2nd vehicle, export CSV) shows an inline upgrade card.

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
- Opens in standalone mode (no browser chrome)
- Service worker caches app shell + last `/dashboard` visit
- Offline: shows cached data with stale indicator
- Updates: service worker refreshes on next network connection

### Install button in Settings
`/settings` → bottom section → "Add to home screen" button (only shown if not already installed or on iOS).

---

*Last updated: 2026-06-11. Covers all shipped features as of commit `8076732`.*
