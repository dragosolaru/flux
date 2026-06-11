# Flux 2027 — Redesign Spec

**Status:** Approved  
**Date:** 2026-06-11  
**Scope:** Visual design system overhaul + UX flow improvements. Zero logic/API changes.  
**Target:** 90% mobile browser (iOS Safari + Android Chrome), with desktop as secondary.  
**Philosophy:** "Ambient Numbers + Material Spatial" — data IS the interface, chrome recedes.

---

## 1. Design Tokens

### 1.1 Border Radius (replaces uniform `rounded-xl`)

```css
--radius-xs:   4px    /* inputs, small chips */
--radius-sm:   6px    /* secondary buttons */
--radius-md:   10px   /* primary buttons, small cards */
--radius-lg:   14px   /* standard cards */
--radius-xl:   20px   /* hero cards, bottom sheet */
--radius-pill: 9999px /* floating nav, badges only */
```

Update `globals.css`:
- `--radius: 0.625rem` (10px base, down from 0.65rem)
- Add all 6 variants above under `@theme inline`

### 1.2 Spacing

No new CSS variables needed — use existing Tailwind scale but enforce tighter conventions:

| Use | Class | px |
|---|---|---|
| Between inline elements | `gap-0.5` | 2 |
| Within a component | `gap-1` | 4 |
| Between related elements | `gap-2` | 8 |
| Card internal padding | `p-3` | 12 (was p-4=16) |
| Hero card padding | `p-4` | 16 (was p-6=24) |
| Between page sections | `gap-4` | 16 |

### 1.3 Typography Scale

```css
/* New micro/label sizes — add to @theme inline */
--text-2xs: 0.625rem;  /* 10px — chip labels, section headers */
--text-xs:  0.6875rem; /* 11px — metadata, nav labels */
/* text-sm stays 14px for body */
/* text-base stays 16px — iOS safe for inputs */
```

Usage conventions:
- `10px` — section headers (uppercase + tracking-widest), status tags, nav labels when active
- `11px` — timestamps, secondary metadata, inactive nav
- `13px` — body text (use `text-[13px]`)
- `15px` — primary labels (`text-[15px]`)
- `20px` — sub-headings
- `32px` — secondary hero numbers
- `52px` — SOC % hero (`text-[52px]`)

### 1.4 Component Heights

| Component | Old | New |
|---|---|---|
| Quick action buttons | `min-h-[48px]` | `size-9` (36px) circular |
| Form inputs | `py-3` (~44px) | `py-2` (36px) |
| Primary CTA mobile | 44-48px | `h-10` (40px) |
| Primary CTA desktop | 44px | `h-9` (36px) |
| Secondary buttons | 40-44px | `h-8` (32px) |
| Icon-only buttons | 40px | `size-8` (32px) |
| TopBar mobile | `h-11` (44px) | `h-10` (40px) |
| Bottom nav | 48px bar | 44px floating pill |
| Stat chips row | ~68px total | ~20px single line |
| Settings rows | `min-h-[52px]` | `min-h-[44px]` |

### 1.5 Card Classes (replace `.glass-card` on static elements)

```css
/* globals.css additions */

/* Solid surface — for dashboard cards, settings, garage */
.data-card {
  background: oklch(0.13 0.015 265);
  border-radius: var(--radius-lg); /* 14px */
  padding: 0.75rem; /* 12px */
}

/* Slightly elevated — for interactive rows, action areas */
.action-card {
  background: oklch(0.16 0.012 265);
  border-radius: var(--radius-md); /* 10px */
  padding: 0.625rem 0.75rem;
  border: 1px solid oklch(1 0 0 / 0.05);
}

/* Keep .glass-card and .pill-float — only for floating/overlay elements */
```

**Rule:** `glass-card` (with `backdrop-filter: blur`) is used ONLY on:
- Floating pill nav
- Bottom sheet on map
- Map overlay buttons

Everything else uses `data-card` or `action-card` (no blur = better mobile performance).

### 1.6 Ambient Background Tinting

Applied to `<body>` via a CSS class set by dashboard state:

```css
.ambient-charging { background-color: oklch(0.12 0.028 250); } /* blue */
.ambient-low      { background-color: oklch(0.12 0.025 45);  } /* amber */
.ambient-full     { background-color: oklch(0.12 0.022 162); } /* green */
/* default .dark body = oklch(0.10 0.02 265) — neutral */
```

Transition on `body`: `transition: background-color 1.4s ease`

Thresholds: low < 20%, full > 90%, charging = any active charge session.

---

## 2. Navigation — Floating Pill

### 2.1 Component: `BottomNav.tsx` (full rewrite)

**Tab structure (changed):**

| Tab | Icon | Route | Gate |
|---|---|---|---|
| Car | `Car` | `/dashboard` | VEHICLE |
| Map | `Map` | `/map` | none |
| Charge | `Zap` | `/charging` | VEHICLE |
| More | `MoreHorizontal` | slide-up sheet | none |

Map moves to center — most-used feature gets prime position.

**Visual spec:**
```
position: fixed
bottom: calc(14px + env(safe-area-inset-bottom))
left: 50%
transform: translateX(-50%)
width: auto (min 240px, max 300px)
height: 52px (pill + padding)
background: oklch(0.13 0.02 265 / 0.88)
backdrop-filter: blur(24px)
-webkit-backdrop-filter: blur(24px)
border: 1px solid oklch(1 0 0 / 0.08)
border-radius: 9999px
padding: 4px
```

**Tab dimensions:**
- Each tab: `w-[60px] h-[44px]`, `rounded-full`
- Active: `bg-white/[0.06]`, icon `text-primary`, label `text-[11px]` slides in (height 0→auto, opacity 0→1, 180ms)
- Inactive: icon `text-muted-foreground/60`, no label

**Scroll auto-hide (cross-browser safe):**
```typescript
// useScrollDirection hook
// Listens to window scroll, returns "up" | "down" | "top"
// translateY: down → "+70px" (hidden), up/top → "0" (visible)
// transition: translateY 220ms cubic-bezier(0.32, 0.72, 0, 1)
```

**"More" slide-up sheet content:**
- Costs, Energy, Trip Planner, Settings, About Data
- Opens from bottom, `rounded-t-[20px]`, handle bar
- Height: 60vh max

### 2.2 Spacer

All pages need bottom spacer: `pb-[calc(72px+env(safe-area-inset-bottom))]` to prevent pill covering content.

---

## 3. Dashboard — Ambient Numbers

### 3.1 Hero Section (replaces `HeroCard` GlassCard wrapper)

No card wrapper. Numbers float directly on the ambient-tinted page background.

```
Layout (top to bottom, px-4):

[vehicleName]          [LiveBadge]
                                      ← 16px gap

        87                            ← text-[52px] font-bold tabular-nums
         %                            ← text-base muted, positioned top-right of number
       321 km                         ← text-xl text-muted-foreground

━━━━━━━━━━━━━━━╴ · · ·              ← progress bar h-[3px] rounded-full
                                      ← charge limit marker: w-px h-3 bg-white/40

⚡ 78kW · 23°C · 48,241 km · 32A    ← stat strip: text-[13px] muted, separator "·"
● Live · acum 12s                     ← 10px, muted-foreground/50
```

**SOC % positioning:** number centered, "%" superscript-style at `text-base` positioned `top-0 right-[calc(50%-2rem)]` or using flex with `items-start`.

**Progress bar:** `h-[3px]` (was h-2 = 8px), still uses motion.div for animation.

**Stat strip** (replaces StatChips row):
```tsx
// Single <p> element
"⚡ {power}kW · {temp}°C · {odometer}km · {current}A"
// text-[13px] text-muted-foreground leading-none
// Scrollable if too long: overflow-x-auto whitespace-nowrap scrollbar-none
// Items hidden if null: only render if value exists
```

### 3.2 Quick Actions (replaces grid)

```
Layout: horizontal scroll strip, centered, gap-3

[🔒] [🔓] [❄️] [🔊] [💡] [⚡]
 10px labels below each icon
```

Each button:
```tsx
className="flex flex-col items-center gap-1 rounded-full"
// Button circle: size-9 (36px)
// Background active: bg-primary/15 border-primary/30
// Background inactive: bg-white/[0.06] border-white/6 border
// Icon: size-4 (16px)
// Label: text-[10px] tracking-wide text-muted-foreground
```

Action feedback (replaces nothing — adds micro-animation):
- On press: icon `scale(0.85)` then `scale(1)` ring expand + fade (200ms)
- No confirmation dialogs for: lock, unlock, honk, flash (reversible)
- Confirmation (one-tap hold or explicit) for: climate start (costs money)

### 3.3 Ambient Tinting Integration

In `dashboard-client.tsx`:
```typescript
// Derive ambient class from vehicle state
function getAmbientClass(state: VehicleState | undefined): string {
  if (!state) return "";
  if (state.chargingState === "Charging") return "ambient-charging";
  if ((state.batteryLevel ?? 100) < 20) return "ambient-low";
  if ((state.batteryLevel ?? 0) > 90) return "ambient-full";
  return "";
}

// Apply via useEffect on body classList
useEffect(() => {
  const cls = getAmbientClass(state);
  document.body.classList.remove("ambient-charging", "ambient-low", "ambient-full");
  if (cls) document.body.classList.add(cls);
  return () => document.body.classList.remove("ambient-charging", "ambient-low", "ambient-full");
}, [state?.chargingState, state?.batteryLevel]);
```

---

## 4. Authentication — Unified Flow

### 4.1 Single-Screen Auth (`/login` handles both login + register)

**Flow change:** If email is not found on submit → show "Cont nou detectat. Creăm contul?" inline confirmation → second submit creates account. Eliminates navigating between `/login` and `/register`. `/register` still exists as alias for direct links.

**Layout:**
```
Full-screen dark bg (ambient-neutral)
Centered column, max-w-xs, px-6

logo: "flux" — text-2xl font-extralight tracking-widest, centered
tagline: text-[12px] muted, centered, mb-12

EMAIL                              ← text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60
[input — borderless, bottom-line]  ← h-9, bg-transparent, border-b border-white/12
                                   ← focus: border-b-primary (animated 200ms)

PAROLĂ
[input]

[    Continuă    ]                 ← h-10, bg-primary, rounded-[10px], full-width

── sau ──                          ← text-[11px] muted, with hr lines

[G  Continuă cu Google]            ← h-10, border border-white/8, rounded-[10px], full-width

Cont nou?  ·  Ai deja cont?        ← text-[12px] centered, inline toggle
```

### 4.2 Input Styling (no-border-box pattern)

```css
/* Applied globally to auth inputs */
.auth-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid oklch(1 0 0 / 0.12);
  border-radius: 0;
  padding: 0.5rem 0 0.5rem 0;
  font-size: 0.9375rem; /* 15px — iOS safe */
  transition: border-color 200ms ease;
}
.auth-input:focus {
  outline: none;
  border-bottom-color: var(--primary);
}
.auth-input::placeholder {
  color: oklch(1 0 0 / 0.25);
}
```

Labels: `text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 mb-1 block`

---

## 5. Map Screen — Progressive Trip Planning

### 5.1 Flow Change: Live Recalculation

```
Old flow: fill form → Press Plan → wait 2-3s → see results
New flow:
  1. Type destination → debounce 600ms → show distance estimate + skeleton stops
  2. Adjust battery slider → recalculate (debounced 400ms)
  3. Full results appear progressively (no explicit submit needed)
  4. "Send to Tesla" button appears when plan is ready
```

Implementation: the Plan button becomes optional — results appear automatically. Keep "Plan" button as explicit trigger for when user wants to force-recalculate.

### 5.2 Bottom Sheet Dimensions

```
PEEK:         68px  (was 96px)   — handle + 1 line hint
PEEK_SUMMARY: 140px (was 158px)  — post-plan compact strip
HALF:         45vh               — unchanged
FULL:         88vh               — unchanged
```

Summary strip (PEEK_SUMMARY):
```
320km · 3h20 · 2 opriri · €4.80    [Edit]
```
Single line, `text-[13px]`, with an Edit chip on the right.

---

## 6. Settings — Restructured Layout

### 6.1 Section Order + Collapsing

```
ESENȚIAL (always visible, no header label)
  → Language selector row
  → Home location row
  → Energy tariff row

VEHICULE
  → Vehicle list with inline scenario switcher

CONTUL & BILLING  (collapsible, closed by default on first visit)
  → Current plan + upgrade CTA
  → Export data
  → Delete account

AVANSAT  (collapsible)
  → Notifications (WhatsApp, email)
  → Charger network stats
  → Virtual Key setup
```

### 6.2 Section Headers

```tsx
// Remove current "text-xs uppercase tracking-widest" style
// New: almost invisible structural markers
className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground/40 px-1 mb-1 mt-5 first:mt-0"
```

### 6.3 Row Height

```
min-h-[44px]  (was min-h-[52px])
py-2.5        (was py-3)
```

---

## 7. Onboarding — 3-Screen Swipe Flow

### 7.1 Replace GettingStartedCard

`GettingStartedCard` on dashboard is removed. Replaced with a full-screen first-visit overlay shown once.

**Trigger:** `localStorage.getItem("onboarding-v2-complete")` is null + user has 0 vehicles.

**3 screens (swipeable, or Next button):**

```
Screen 1: "Bun venit în Flux"
  Illustration: car silhouette (existing SVG)
  Body: "Adaugă mașina ta sau explorează cu vehiculul demo"
  CTA: [Adaugă Tesla]  [Explorează Demo]

Screen 2: "Urmărește costurile"  (shown after vehicle added)
  Body: "Fă o poză la bonul de alimentare — Flux extrage automat datele"
  CTA: [Fă o poză]  [Mai târziu]

Screen 3: "Planifică primul drum"
  Body: "Introdu destinația și Flux calculează opririle la încărcătoare"
  CTA: [Deschide harta]  [Gata]
```

**Layout:**
- Full-screen overlay, `z-[9999]`
- Background: `oklch(0.08 0.02 265)` (darker than app bg)
- 3 dots progress indicator
- X button top-right (skips all, marks complete)
- Swipe gesture (touch) or Next button

**Completion:** sets `localStorage.setItem("onboarding-v2-complete", "1")`

---

## 8. Globals.css Changes Summary

```css
/* 1. Update --radius base */
--radius: 0.625rem; /* 10px, was 0.65rem */

/* 2. Add to @theme inline */
--radius-xs: 4px;
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 20px;
--radius-pill: 9999px;

/* 3. Add ambient classes */
.ambient-charging { background-color: oklch(0.12 0.028 250); }
.ambient-low      { background-color: oklch(0.12 0.025 45);  }
.ambient-full     { background-color: oklch(0.12 0.022 162); }
body              { transition: background-color 1.4s ease;  }

/* 4. Add card utilities */
.data-card { ... }
.action-card { ... }

/* 5. Add auth input utility */
.auth-input { ... }

/* 6. Remove .glass-card blur from non-floating contexts */
/* glass-card kept for map overlays + floating pill only */
```

---

## 9. Files Changed

| File | Change |
|---|---|
| `src/app/globals.css` | tokens, ambient, data-card, action-card, auth-input |
| `src/components/layout/BottomNav.tsx` | full rewrite → floating pill, new tab order |
| `src/components/layout/TopBar.tsx` | h-10 mobile |
| `src/app/(dashboard)/dashboard/dashboard-client.tsx` | hero, stat strip, quick actions, ambient tinting |
| `src/app/(dashboard)/layout.tsx` | bottom spacer, ambient transition |
| `src/components/auth/LoginForm.tsx` | borderless inputs, unified flow hint |
| `src/app/(auth)/login/page.tsx` | new centered layout |
| `src/app/(auth)/register/page.tsx` | alias redirect or same component |
| `src/app/(dashboard)/settings/settings-client.tsx` | section collapse, row height |
| `src/app/(dashboard)/map/map-client.tsx` | peek heights, summary strip, progressive planning |
| `src/components/onboarding/GettingStartedCard.tsx` | remove from dashboard |
| `src/components/onboarding/OnboardingOverlay.tsx` | new 3-screen component |
| `src/hooks/useScrollDirection.ts` | new hook for pill auto-hide |
| `src/lib/i18n/locales/*.json` | new keys for onboarding screens |
| `docs/FEATURES.md` | update design section |

---

## 10. Out of Scope

- No API/logic changes
- No new dependencies
- No changes to TanStack Query, auth, Supabase, Stripe
- No changes to trip planner algorithm
- TypeScript strict + lint must pass
- All 5 locale files updated for any new strings

---

## 11. Implementation Order (by risk, low → high)

1. `globals.css` — tokens + utilities (zero component risk)
2. `TopBar.tsx` — height tweak only
3. `BottomNav.tsx` — full rewrite (isolated component)
4. `useScrollDirection.ts` — new hook
5. `settings-client.tsx` — row heights + collapsible sections
6. `LoginForm.tsx` + auth pages — borderless inputs + layout
7. `dashboard-client.tsx` — hero, stat strip, quick actions, ambient
8. `map/map-client.tsx` — peek heights + progressive planning
9. `OnboardingOverlay.tsx` — new component + remove GettingStartedCard
10. i18n keys across all 5 locales
