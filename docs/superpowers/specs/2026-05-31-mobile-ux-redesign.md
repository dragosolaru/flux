# Flux — Mobile-First UX Redesign v2

**Date:** 2026-05-31  
**Scope:** Full redesign of all dashboard screens for mobile-first (90% mobile usage)  
**Visual direction:** Dark mode default, glassmorphism cards, Framer Motion animations  
**Approach:** Full redesign — all screens, all components

---

## 1. Design System

### Color tokens (Tailwind CSS variables in `globals.css`)

```css
/* Dark mode base (default) */
--background: 222 47% 4%;          /* #0A0A0F quasi-black with blue tint */
--surface-1: rgba(255,255,255,0.04); /* glassmorphism card base */
--surface-2: rgba(255,255,255,0.08); /* elevated card */
--border: rgba(255,255,255,0.08);
--foreground: 210 40% 98%;         /* #F8FAFC */
--muted-foreground: 215 16% 60%;   /* #94A3B8 */

/* Semantic */
--primary: 217 91% 60%;            /* Electric Blue #3B82F6 */
--primary-glow: rgba(59,130,246,0.3);
--success: 142 71% 45%;            /* Battery Green #22C55E */
--success-glow: rgba(34,197,94,0.25);
--warning: 38 92% 50%;             /* Amber #F59E0B */
--destructive: 0 84% 60%;          /* Red #EF4444 */
```

Light mode: standard white/light-gray background, same accent colors.

### Glass card pattern

```tsx
// Standard glass card class
"rounded-2xl border border-white/8 bg-white/5 backdrop-blur-xl shadow-lg"
// Elevated (hero elements)
"rounded-3xl border border-white/10 bg-white/8 backdrop-blur-xl shadow-2xl"
```

### Typography scale (mobile-first)

- Hero number (SOC%): `text-7xl font-bold tabular-nums`
- Section title: `text-lg font-semibold`
- Card title: `text-sm font-medium`
- Body: `text-sm`
- Label/caption: `text-xs text-muted-foreground`

### Touch targets

All interactive elements: minimum `44×44px` (Apple HIG). Large actions: `52px` height minimum.

### Animation presets (Framer Motion)

```tsx
// Card fade-up (use on mount)
const fadeUp = { initial: {opacity:0, y:16}, animate: {opacity:1, y:0}, transition: {type:"spring", stiffness:300, damping:30} }

// Scale press feedback (tap/click)
const pressScale = { whileTap: {scale:0.97} }

// Stagger children (lists)
const stagger = { animate: { transition: { staggerChildren: 0.06 } } }

// Page slide-in
const pageSlide = { initial:{x:20,opacity:0}, animate:{x:0,opacity:1}, exit:{x:-20,opacity:0} }
```

### Skeleton screen

Replace all loading spinners with `<Skeleton>` (shimmer animation via CSS `animate-pulse`). Pattern: `rounded-xl bg-white/5 animate-pulse`.

---

## 2. Navigation

### Bottom nav bar (mobile, `md:hidden`)

Current state: 5 tabs with capability gating. Redesign:

- **Pill indicator**: animated `motion.div` that slides to the active tab (absolute position, same row)
- **Active state**: icon + label in primary color + subtle glow behind pill
- **Inactive**: muted icon only (no label when collapsed), label appears on active
- **Locked tabs**: lock icon overlay, tap → slide-up explanation
- Height: `64px + safe-area-inset-bottom`
- Background: `bg-background/80 backdrop-blur-2xl border-t border-white/8`

### Sidebar (desktop, `hidden md:flex`)

Unchanged structure, apply new color tokens.

---

## 3. Screens

### 3.1 Dashboard (`/dashboard`)

**Layout:**
```
┌─────────────────────────────────────┐
│ Vehicle name · Live badge           │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  [Vehicle silhouette SVG]     │  │
│  │       80%          380km      │  │
│  │  [████████████░░░░] SOC bar   │  │
│  └───────────────────────────────┘  │
│                                     │
│  ←[ Location ][ Temp ][ Speed ]→    │  scroll
│                                     │
│  Quick actions:                     │
│  [Climate] [Lock/Unlock] [Charge]   │
│                                     │
│  [Charging card — if plugged in]    │
└─────────────────────────────────────┘
```

**Hero card:**
- Background: dark gradient (`from-blue-950/80 to-slate-900/80`) with glassmorphism
- SOC%: `text-7xl font-bold` — the first thing the eye sees
- Range: `text-2xl text-muted-foreground` below SOC
- SOC progress bar: animated fill, green when >50%, amber 20-50%, red <20%
- "Live" badge: pulsing green dot + "LIVE" text when data is fresh; grey when stale

**Stat chips (horizontal scroll, `overflow-x-auto snap-x`):**
- Each chip: glass card, icon + value + label
- Fields: Location, Exterior temp, Odometer, Last seen

**Quick actions:**
- 3 large buttons in a row (equal width)
- Climate: blue → active state shows temp
- Lock/Unlock: toggles icon + color
- Press animation: `whileTap: {scale:0.95}`

**Charging overlay card (conditional):**
- Shows only when `chargingState === "Charging"`
- Animated circular progress ring (SVG, `stroke-dashoffset` animation)
- Shows: current % → target %, power kW, time remaining

### 3.2 Garage (`/garage`)

**Layout:**
- Vehicle cards: full-width, `aspect-[16/7]`, gradient background (blue → teal per model)
- Model name large (`text-2xl font-bold`), nickname below
- SoC indicator bar at bottom of card
- "+" add vehicle: dashed border card, same size
- Swipe to manage (future-compatible with right-swipe actions)

### 3.3 Charging (`/charging`)

**Layout:**
```
┌─────────────────────┐
│ [Active charge ring] │  (conditional)
│ Status: Charging     │
│ 67% → 90% · 23 min  │
├─────────────────────┤
│ Charge Limit slider  │
├─────────────────────┤
│ Scheduled charging   │
├─────────────────────┤
│ History              │
│  · Session card      │
│  · Session card      │
└─────────────────────┘
```

**Active charging ring:**
- SVG `<circle>` with `stroke-dashoffset` animated from current SoC to 100%
- Centered: current % large, kW and time remaining below
- Ring color: green (charging), amber (limited), grey (not charging)
- Pulse animation on the ring arc: `animate-pulse` on the active stroke

**History cards:**
- Each session: date + duration + kWh + cost in a 2×2 grid
- Icon: charging plug, green if home, blue if public
- Swipe-to-delete (future)

### 3.4 Costs (`/costs`)

**Layout:**
```
┌─────────────────────────────────────┐
│ KPI chips row (horizontal scroll)   │
│  cost/km · kWh · home/pub · fuel    │
├─────────────────────────────────────┤
│ Monthly bar chart (full width)      │
├─────────────────────────────────────┤
│ Documents heading + filter          │
│  · Doc card (timeline style)        │
│  · Doc card                         │
│  ...                                │
└─────────────────────────────────────┘
│ FAB ⊕ (bottom right, above nav)    │
```

**KPI chips:** Horizontal scrollable row, each chip: glass card with icon, large value, small label below. Tap to expand detail (future).

**Monthly chart:** recharts `BarChart`, full width, gradient bars (blue → teal), tooltip glassmorphism style.

**Document cards (timeline):**
- Left: colored dot + vertical line (timeline)
- Right: network icon, date, amount, status badge
- Status badges: `done` (green), `needs_review` (amber), `error` (red)
- Tap → expand inline details or navigate to detail view

**FAB:** `fixed bottom-24 right-4` (above bottom nav), 56px circle, primary color, `+` icon, `whileHover:{scale:1.05}`, `whileTap:{scale:0.95}`, opens upload sheet.

### 3.5 Energy (`/energy`)

**Layout:**
- Top: "Smart Charge" recommendation card — most prominent element
  - Shows: optimal start time, estimated saving (€), badge "Recomandat ✓"
- Price curve chart: `AreaChart`, 24h, current hour highlighted with vertical dashed line
- "Schedule" action button: large, under chart
- Departure & Preconditioning: collapsible card below

### 3.6 Commands (`/commands`)

**Layout:**
- Grid 2 columns, auto rows
- Each button: glass card, `min-h-[80px]`, large icon (32px), label below
- Active state: border glows with primary color
- Sending state: spinner replaces icon, button disabled
- Buttons: Lock, Unlock, Climate On, Climate Off, Honk, Flash
- Error/success toast (slide-up from bottom)

### 3.7 Trip Planner (`/trip`)

Already redesigned (collapsible form, ABRP-style map). Minor polish:
- Apply glass card style to search overlay
- Ensure stop cards use new glass style

### 3.8 Charging Map (`/charging-map`)

Already full-screen Leaflet map. Additions:
- Bottom sheet for station detail (slide up on marker tap)
- Glass card for station info in popup

### 3.9 Settings (`/settings`)

**Layout (iOS-style list):**
- Section headers: small caps, muted, `text-xs uppercase tracking-wider`
- Row items: `min-h-[52px]`, icon left (colored, rounded square bg), label center, control/chevron right
- Separator between items (1px, `border-white/5`)
- Danger zone section: red accent, "Delete account" row with red icon

### 3.10 Auth (`/login`, `/register`)

**Layout:**
- Top half: dark background, `F` Flux logo + tagline, animated electric glow
- Bottom half: white/glass card slides up, form inside
- OR: full-screen dark, centered card with blur background
- Input fields: dark fill, white border, large `py-3` padding
- Submit: full-width, gradient primary button
- No distracting decoration — clean and focused

### 3.11 Landing page (`/`)

- Mobile hero: stacked (not side-by-side), big headline, CTA button
- Feature grid: 1 column on mobile, 2 on `sm:`, 4 on `lg:`
- App store badges (placeholder for future PWA/native)

---

## 4. Shared components to create/update

| Component | Location | Change |
|-----------|---------|--------|
| `GlassCard` | `src/components/ui/glass-card.tsx` | New — base glass card with motion |
| `KpiChip` | `src/components/ui/kpi-chip.tsx` | New — icon + value + label chip |
| `SectionHeader` | `src/components/ui/section-header.tsx` | New — page section heading |
| `Skeleton` | already in shadcn | Update usage — replace spinners |
| `BottomNav` | existing | Pill indicator animation |
| `PageWrapper` | `src/components/layout/page-wrapper.tsx` | New — fade-up animation + safe area |
| `CircularProgress` | `src/components/ui/circular-progress.tsx` | New — SVG ring for charging |

---

## 5. Implementation order (parallel agents)

Given parallel agents approach:

**Group 1 (shared foundation — must go first, blocks others):**
- Design tokens in `globals.css`
- `GlassCard`, `KpiChip`, `SectionHeader`, `PageWrapper`, `CircularProgress`
- Install Framer Motion: `npm install framer-motion`
- `BottomNav` pill animation

**Group 2 (parallel after Group 1):**
- Agent A: Dashboard + Garage
- Agent B: Costs (FAB, document timeline, KPI chips)
- Agent C: Charging (ring animation, history cards)
- Agent D: Energy + Commands

**Group 3 (parallel after Group 2):**
- Agent E: Settings + Auth
- Agent F: Landing page + Trip Planner polish

---

## 6. Constraints

- Tailwind CSS v4 (already configured) — use utility classes, not arbitrary values where avoidable
- No breaking changes to API or data layer — UI changes only
- i18n keys already in place — use `t()` for all strings
- `npx tsc --noEmit` + `npm run lint` must pass after each agent
- `framer-motion` added to `package.json` (one agent handles install)
- Existing shadcn/ui components stay — we style on top, don't replace them
- Dark mode: `next-themes` already in place, keep `dark:` prefix strategy
