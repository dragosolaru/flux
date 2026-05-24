# A.1 — UI Gating + Capability Model + Mobile-first Foundation

**Status:** Approved (pending final spec review)
**Date:** 2026-05-24
**Phase:** A.1 (Live end-to-end foundation)
**Estimated effort:** 2.5 weeks
**Author:** Brainstorming session, dragos + claude

---

## 1. Goal

Build the architectural foundation for everything in Phases B–E:

- A **capability model** so every feature declares what it needs (vehicle, live connection, tariff, virtual key) and the UI adapts automatically
- A **mobile-first navigation** so the app works on phones (most users will be on mobile)
- **i18n** so all copy is translatable from day 1 (RO + EN at launch)
- **Multi-currency** so a user in Bucharest sees lei while a user in Berlin sees euro
- A **polished animation layer** (Framer Motion) so the app feels premium, not utilitarian
- A **home-location-aware** foundation for cost attribution (used in A.5)

No new features ship in A.1 — but every feature in B/C/D/E plugs into this foundation without retrofit.

---

## 2. Non-goals

- Activating Tesla live integration (that is A.2)
- Implementing actual commands like window control or preconditioning (Phase C)
- Building WhatsApp OCR (Phase B.1)
- Building the tariff database (Phase B.2)
- Push notifications infrastructure (Phase C)
- Stripe billing (Phase E)

---

## 3. The capability model

### Levels (in unlock order)

```
NONE        → public to any authenticated user
VEHICLE     → user has at least one vehicle (mock or live)
LIVE        → user has a vehicle with data_source = 'live'
TARIFF      → user has configured an energy tariff provider
COMMANDS    → user has a live vehicle with virtual_key_paired = true
```

`HISTORY` (charging history synced) and `LOCATION` (home address set) are tracked but not used as gates in A.1 — they become gates in A.5.

### Feature → capability matrix (full app, current + planned)

| Feature / route | Min capability |
|---|---|
| `/garage` | NONE |
| `/charging-map` | NONE |
| `/settings` | NONE |
| `/about-data` | NONE |
| `/dashboard` (mock data) | VEHICLE |
| `/charging` (mock data) | VEHICLE |
| `/costs` (manual upload + email) | VEHICLE |
| `/trip` (mock estimate) | VEHICLE |
| `/dashboard` live cards (real SOC, location, weather) | LIVE |
| `/charging` history sync (Tesla API) | LIVE |
| `/energy` smart charging recommendations | LIVE + TARIFF |
| `/energy` price curves | TARIFF |
| `/commands` (new page) | LIVE + COMMANDS |
| Window control + auto-alert | LIVE + COMMANDS |
| Preconditioning | LIVE + COMMANDS |
| WhatsApp OCR (Phase B.1) | VEHICLE |

### API surface

```typescript
// src/lib/capabilities.ts
export type Capability = 'NONE' | 'VEHICLE' | 'LIVE' | 'TARIFF' | 'COMMANDS';

export interface CapabilityContext {
  hasVehicle: boolean;
  hasLiveVehicle: boolean;
  hasTariff: boolean;
  hasCommandsReady: boolean;  // virtual_key_paired
}

export type GateResult =
  | { ok: true }
  | { ok: false; missing: Capability; cta: { label: string; href: string } };

export function checkCapability(
  required: Capability,
  ctx: CapabilityContext,
): GateResult;
```

Server-side: built from session + DB queries.
Client-side: `useCapabilities()` hook calls a single endpoint `/api/me/capabilities` that returns the context object.

---

## 4. Navigation — mobile-first dual layout

### Mobile (< 768px) — bottom navigation

5 tabs, fixed at the bottom, persistent across pages:

```
┌──────────────────────────────────┐
│         [page content]           │
├──────────────────────────────────┤
│  🚗      🔋     💰     ⚡    ⋯  │
│ Mașina Încărc. Costuri Energ. Mai mult
└──────────────────────────────────┘
```

| Tab | Route | Capability indicator (✦) |
|---|---|---|
| Mașina | `/dashboard` | If no vehicle |
| Încărcare | `/charging` | If no vehicle |
| Costuri | `/costs` | If no vehicle |
| Energie | `/energy` | If no tariff |
| Mai mult | (slide-up panel) | — |

**Tab indicator:** a pill underline that slides smoothly between tabs on switch (Framer Motion `layoutId`).

**"Mai mult" panel:** swipe-up sheet (Vaul library or hand-rolled with Framer Motion) containing: Hartă stații, Trip planner, Comenzi, Setări, Despre, Schimbare limbă, Schimbare valută.

### Desktop (>= 768px) — sidebar (restructured)

```
┌───────────────────────────┐
│  ⚡ Flux         DAO Lab  │
├───────────────────────────┤
│                           │
│  MAȘINA                   │
│  ◉ Dashboard              │
│  ◉ Încărcare              │
│  ◉ Comenzi          ✦     │
│                           │
│  BANI & ENERGIE           │
│  ◉ Costuri                │
│  ◉ Energie & tarife  ✦    │
│  ◉ Harta stațiilor        │
│                           │
│  PLANIFICARE              │
│  ◉ Trip planner           │
│                           │
│  ─────────────────────    │
│  ◉ Setări                 │
│  ◉ Despre                 │
│                           │
└───────────────────────────┘
```

**`✦` indicator:** subtle character (not a lock), shown when the section requires capabilities the user doesn't have. On hover: tooltip — *"Necesită Tesla conectat"*. On click: the page loads its `CapabilityEmptyState`.

### Breakpoints

| Width | Layout |
|---|---|
| `< 768px` | Bottom nav, single column, full-width cards |
| `768–1280px` | Sidebar, 2-column grid |
| `> 1280px` | Sidebar, 3-column grid |

### Mobile gestures

- **Pull-to-refresh** on Dashboard, Charging, Costs (using `@use-gesture/react`)
- **Long-press on command buttons** → confirmation dialog (safety for destructive actions)
- **Swipe-down on slide-up panel** → dismiss

---

## 5. Components — `FeatureGate` + `CapabilityEmptyState`

### `<FeatureGate capability="live">`

```tsx
<FeatureGate capability="live">
  <SmartChargeCard />
</FeatureGate>
```

If the capability is met → renders children.
If not → renders `<CapabilityEmptyState missing={...} />`.

Transparent wrapper. No styling. Composable.

### `<CapabilityEmptyState missing="LIVE">`

4 variants (one per gate-able capability). Each has:

- Large illustrative icon (animated float loop)
- Title that **sells the feature**, not the blocker
- Subtitle explaining what's needed
- One CTA button

```
┌─────────────────────────────────────┐
│                                     │
│           ⚡  (icon)                │
│                                     │
│   Date reale, direct din mașină     │
│                                     │
│   Conectează Tesla pentru SOC,      │
│   range și locație în timp real.    │
│                                     │
│      [ Conectează Tesla → ]         │
│                                     │
└─────────────────────────────────────┘
```

| Missing | Icon | Title (RO) | Title (EN) | CTA |
|---|---|---|---|---|
| `VEHICLE` | 🚗 | "Adaugă prima ta mașină" | "Add your first car" | `/garage` |
| `LIVE` | ⚡ | "Date reale, direct din mașină" | "Real data, straight from your car" | `/connect/tesla` |
| `TARIFF` | 💡 | "Știm când e cel mai ieftin să încarci" | "We know when charging is cheapest" | `/settings#tariff` |
| `COMMANDS` | 🔑 | "Controlează mașina din browser" | "Control your car from your browser" | `/settings#virtual-key` |

---

## 6. Onboarding — first-visit experience

A user with no vehicle on `/garage` sees not an empty list but an onboarding hero:

```
┌────────────────────────────────────┐
│                                    │
│    [Subtle animated illustration]  │
│                                    │
│        Bine ai venit în Flux       │
│                                    │
│   Gestionează costurile, monitor.. │
│   și controlează-ți Tesla — totul  │
│   într-un singur loc.              │
│                                    │
│    [ Conectează Tesla →  ]         │
│    [ Explorează cu date demo ]     │
│                                    │
└────────────────────────────────────┘
```

The "Explorează cu date demo" secondary CTA adds a mock vehicle silently (existing `seed-demo` logic, refactored). User can explore the full app before committing to OAuth. Conversion lift estimated meaningful.

---

## 7. Mock-mode banner — redesigned

The existing `MockGlobalBanner` is passive. Redesign:

```
┌───────────────────────────────────────────────────────────────┐
│  🔮  Date simulate · Conectează Tesla pentru date reale  →   │
└───────────────────────────────────────────────────────────────┘
```

- Indigo-violet subtle gradient (preview mode aesthetic — not red/yellow alarm)
- Shown only once per session (cookie `mock_banner_dismissed`)
- Hidden entirely when `data_source = 'live'`
- Click anywhere → routes to `/connect/tesla`

---

## 8. i18n — `next-intl`

### Library

`next-intl` v3+ for Next.js 16 App Router. Server-component first, RSC-friendly.

### Routing strategy: **cookie-based, not URL-prefixed**

- URL stays clean: `/dashboard`, not `/ro/dashboard`
- Locale resolution order: `profiles.locale` (DB) → `flux_locale` cookie → `Accept-Language` header → `'ro'` default
- Middleware sets locale on every request, available via `getLocale()` in server components

### Supported locales — phased

| Locale | Phase | Note |
|---|---|---|
| `ro` | A.1 | Default |
| `en` | A.1 | International users + diaspora |
| `de` | Phase E | Germany = top 5 Tesla market in Europe |
| `hu` | Phase E | Hungarian minority + neighbor |
| `fr` | Phase E | France = large Tesla market |

### File structure

```
src/lib/i18n/
  config.ts          ← supported locales array, default locale
  request.ts         ← getRequestConfig for next-intl
  locales/
    ro.json
    en.json
```

### Key naming — namespaced, flat, no nesting

```json
{
  "nav.mașina": "Mașina",
  "nav.charging": "Încărcare",
  "empty_states.no_vehicle.title": "Adaugă prima ta mașină",
  "empty_states.no_vehicle.cta": "Adaugă Tesla",
  "empty_states.no_live.title": "Date reale, direct din mașină",
  ...
}
```

Flat avoids deep-key fatigue and makes grep-by-feature trivial.

### Locale picker

Dropdown in `/settings` with native names + emoji flag:
```
🇷🇴 Română
🇬🇧 English
```

Changing locale: writes to `profiles.locale`, sets cookie, triggers `router.refresh()`. No page reload.

---

## 9. Currency — multi-currency display

### Storage model (unchanged from existing schema)

- `documents.cost_total`, `documents.cost_currency` — original receipt currency (already in DB)
- `energy_costs.original_amount`, `energy_costs.original_currency` — same
- `energy_costs.cost_ron` — canonical RON value, computed at ingest using BNR rate

### Display model (new)

User has `profiles.display_currency` preference. All UI amounts pass through `formatMoney(ron, userCurrency, locale)` which:

1. Looks up RON → userCurrency rate from `exchange_rates` table (with BNR fallback fetch)
2. Converts
3. Formats with `Intl.NumberFormat` using user's locale

```typescript
formatMoney(150, { from: 'RON', to: 'EUR', locale: 'ro' })  // "30,00 €"
formatMoney(150, { from: 'RON', to: 'RON', locale: 'en' })  // "150.00 RON"
```

### Supported currencies — phased

| Currency | Phase | Rate source |
|---|---|---|
| RON | A.1 | (canonical) |
| EUR | A.1 | BNR |
| USD | A.1 | BNR |
| GBP, HUF, PLN, CHF, NOK, SEK | Phase E | BNR (all available) |

### Currency picker

Below locale picker in Settings. Dropdown shows currency code + symbol.

### Edge cases

- **Receipts in non-RON currency:** stored as-is, converted via the BNR rate from the document's date (already implemented in processor).
- **Missing rate for display conversion:** fall back to RON display + small chip "RON (no live rate)".
- **Future canonical change:** if we ever pivot canonical to EUR, the migration is `cost_eur = cost_ron / eur_ron_rate_at_date`. Not in A.1 scope.

---

## 10. Home location — capture in Settings

User can set home address in `/settings` → a new `HomeLocationPicker` component.

### UI

- Text input for address
- On blur or "Verify" button click: geocode via free Nominatim API (OpenStreetMap)
- Show map preview (small Leaflet map, 200px tall) with the geocoded point
- Save → writes `profiles.home_address`, `home_lat`, `home_lng`

### Why now (in A.1)

Setting home location is a one-time onboarding task. By capturing it in A.1, the data is ready when A.5 (computed metrics) ships and starts attributing home charging properly. Otherwise A.5 has to chase users to backfill.

### Privacy

Home location is stored per-user, never exposed to other users, never sent to third parties. The geocoding call to Nominatim sends only the address string (not user identity).

---

## 11. Animations — Framer Motion + CSS

### Library decisions

- **`framer-motion`** for stateful / orchestrated animations (page transitions, counters, gauge)
- **CSS transitions/keyframes** for micro-interactions (hover, focus, active)
- **No Lottie** for now — keep bundle lean. Empty-state icons are SVG with CSS float animation.

### Animation catalog

| Pattern | Where | Implementation |
|---|---|---|
| Page mount | All dashboard pages | `framer-motion`: `initial={{opacity:0, y:20}} animate={{opacity:1, y:0}}`, 300ms ease-out |
| Card hover (desktop) | All cards | CSS: `hover:-translate-y-0.5 hover:shadow-lg transition` |
| Card press (mobile) | All cards | `framer-motion`: `whileTap={{scale:0.97}}` |
| Number counter | SOC, costs, kWh | `framer-motion`: `useMotionValue` + `animate(value, target, { duration: 0.6 })` |
| Battery gauge | `BatteryGauge.tsx` | SVG `stroke-dashoffset` animated, 800ms ease-in-out |
| Command feedback | Post-command success | Icon morph (button icon → checkmark → back to icon), 1s total |
| Skeleton → content | Loading transitions | Cross-fade 200ms (avoid layout jump) |
| Bottom-nav indicator | Tab switch | `framer-motion`: `layoutId="nav-indicator"`, spring stiffness 400 |
| Empty-state icon | All empty states | CSS keyframe float: `translateY(-4px)` infinite 2s |
| Chart bars | On mount | `framer-motion`: `staggerChildren: 50ms`, each bar grows from bottom |
| Pull-to-refresh | Mobile data pages | `@use-gesture/react` + visual indicator |

### Performance

- All animations use `transform` + `opacity` only (GPU-accelerated)
- `prefers-reduced-motion` honored globally — disables transforms, keeps fades only
- No animations on initial paint above the fold (avoid LCP regression)

### Re-usable variants

```typescript
// src/lib/animations/variants.ts
export const pageVariants = { ... };
export const cardVariants = { ... };
export const staggerContainer = { ... };
```

Single source of truth, used across components.

---

## 12. Commands page (extracted from Dashboard)

`/commands` becomes a dedicated page (gated on `LIVE + COMMANDS`). The existing `CommandPanel` component moves there. Dashboard keeps a small "Acțiuni rapide" card with the 2 most-used commands (climate, lock) + a "Toate comenzile →" link.

Rationale: commands will grow significantly in Phase C (windows, preconditioning, scheduling, alerts) — they deserve their own page. Dashboard stays focused on **monitoring**, not **acting**.

---

## 13. OCR ingest — promoted on Costs page

The existing email OCR (key product differentiator) is currently buried. Add a prominent **IngestCard** at the top of `/costs`:

```
┌──────────────────────────────────────────────┐
│  Adaugă bon                                  │
│                                              │
│  [📷 Foto]  [📧 Email]  [💬 WhatsApp]       │
│  Upload   Trimite la    Curând               │
│           {email-vehicul}                    │
└──────────────────────────────────────────────┘
```

- Foto opens file picker (existing flow)
- Email shows vehicle inbox address with copy-to-clipboard button + "Trimite bonul de la Renovatio, IONITY, MOL etc."
- WhatsApp is disabled with "Curând" badge (lights up in Phase B.1)

---

## 14. Database schema — Migration 008

```sql
-- profiles: user preferences
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'ro'
    CHECK (locale IN ('ro','en','de','hu','fr')),
  ADD COLUMN IF NOT EXISTS display_currency text NOT NULL DEFAULT 'RON'
    CHECK (display_currency IN ('RON','EUR','USD','GBP','HUF','PLN','CHF','NOK','SEK')),
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS home_lat double precision,
  ADD COLUMN IF NOT EXISTS home_lng double precision;

-- charging_sessions: home-charge detection (populated by A.3/A.5, prepared in A.1)
ALTER TABLE charging_sessions
  ADD COLUMN IF NOT EXISTS is_home_charge boolean;

-- vehicles: virtual key pairing state (used by COMMANDS capability check)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS virtual_key_paired boolean NOT NULL DEFAULT false;
```

Backward-compatible. Existing rows get safe defaults.

---

## 15. File manifest

```
NEW:
src/middleware.ts                                  next-intl + auth middleware composition
src/lib/i18n/config.ts
src/lib/i18n/request.ts
src/lib/i18n/locales/ro.json
src/lib/i18n/locales/en.json
src/lib/currency/format.ts                         formatMoney() + Intl wrappers
src/lib/currency/convert.ts                        RON ↔ X using BNR-cached rates
src/lib/capabilities.ts                            capability model + check logic
src/lib/animations/variants.ts                     Framer Motion preset variants
src/hooks/useCapabilities.ts                       client hook calling /api/me/capabilities
src/hooks/usePreferences.ts                        locale + currency + home location
src/app/api/me/capabilities/route.ts               GET capability context
src/app/api/me/preferences/route.ts                GET/PATCH user preferences
src/components/layout/BottomNav.tsx                NEW — mobile nav
src/components/layout/SlideUpMenu.tsx              NEW — "Mai mult" panel
src/components/layout/FeatureGate.tsx              NEW — gating wrapper
src/components/layout/CapabilityEmptyState.tsx     NEW — 4 variants + animations
src/components/settings/LocalePicker.tsx           NEW
src/components/settings/CurrencyPicker.tsx         NEW
src/components/settings/HomeLocationPicker.tsx     NEW (with mini-map)
src/components/costs/IngestCard.tsx                NEW — upload/email/whatsapp surfacing
src/app/(dashboard)/commands/page.tsx              NEW — extracted from Dashboard
src/app/(dashboard)/commands/commands-client.tsx   NEW
supabase/migrations/008_user_preferences.sql       NEW

MODIFIED:
src/app/layout.tsx                                 NextIntlClientProvider, theme provider
src/app/(dashboard)/layout.tsx                     adds BottomNav for mobile
src/app/(dashboard)/garage/page.tsx                onboarding hero when no vehicle
src/app/(dashboard)/garage/garage-client.tsx       new onboarding component
src/components/layout/Sidebar.tsx                  sections + capability indicators
src/components/layout/MockGlobalBanner.tsx         redesign + CTA
src/components/energy/SmartChargeCard.tsx          wrapped in FeatureGate(LIVE+TARIFF)
src/components/vehicle/CommandPanel.tsx            wrapped in FeatureGate(COMMANDS)
src/components/vehicle/BatteryGauge.tsx            Framer Motion fill animation
src/app/(dashboard)/settings/page.tsx              + LocalePicker, CurrencyPicker, HomeLocationPicker
package.json                                       + next-intl, framer-motion, @use-gesture/react, leaflet
```

---

## 16. Environment variables

### Required NOW (already set in production)
All current env vars are sufficient for A.1. No new vars introduced.

### Required for A.2 (next phase, just flag this here)
- `LIVE_INTEGRATIONS=tesla` — currently unset; without it the capability `LIVE` cannot be granted even for connected vehicles

---

## 17. Testing strategy

- **Unit:** `capabilities.ts` `checkCapability()` — pure function, full coverage of all combinations
- **Unit:** `formatMoney()` — locale/currency matrix
- **Component:** `<FeatureGate>` rendering matrix (5 capabilities × 2 contexts)
- **Component:** `<BottomNav>` active tab logic
- **E2E (manual):** mobile viewport in Chrome DevTools — verify all empty states, pull-to-refresh, slide-up panel

Automated mobile E2E (Playwright) deferred to a separate effort — adds CI complexity not warranted in A.1.

---

## 18. Out of scope (explicitly deferred)

- Service worker / PWA install prompt (Phase D polish)
- Native mobile app (React Native) — far future
- Tablet-specific layout — desktop layout scales acceptably
- RTL languages (Arabic, Hebrew) — not in supported locale set
- Dark/light theme toggle — currently dark-only by design choice; light theme not in A.1
- Onboarding tour overlay — defer to Phase E polish

---

## 19. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `next-intl` v3 incompatibility with Next.js 16 | Low | Already targets App Router; pin to verified version |
| Framer Motion bundle size impact | Medium | Tree-shaken by Next.js; lazy-load on routes that don't animate heavily |
| Mobile gesture conflicts with browser scroll | Medium | Use `@use-gesture/react` which handles this; test on iOS Safari |
| Nominatim rate limit (1 req/sec) on geocoding | Low | One geocode per user lifetime; can swap to Mapbox in Phase D if needed |
| Translation lag (RO complete, EN partial) | Medium | EN starts as 1:1 translation of RO; native EN polish in Phase D |
| Currency conversion staleness during BNR downtime | Low | Existing BNR client has 7-day fallback; keep |

---

## 20. Success criteria

A.1 is done when:

- ✅ Every page renders correctly on mobile viewport (375×667) with no overflow or broken layouts
- ✅ Bottom nav switches between sections with animated indicator
- ✅ Switching locale RO↔EN updates all visible copy without page reload
- ✅ Switching currency RON↔EUR↔USD updates all monetary amounts immediately
- ✅ A user with no vehicle sees onboarding (not empty states)
- ✅ A user with mock vehicle sees mock banner + sees empty state on /commands
- ✅ A user with live vehicle (manually inserted for testing) sees real data, no banner
- ✅ Setting home address geocodes and saves
- ✅ All animations respect `prefers-reduced-motion`
- ✅ TypeScript strict — zero errors
- ✅ No regressions on existing email OCR or cost intelligence flows

---

## 21. Next step after A.1

A.2 — reactivate Tesla live integration:
- Set `LIVE_INTEGRATIONS=tesla` in Vercel
- QA OAuth flow end-to-end
- Verify capability `LIVE` activates for connected users
- Verify `<FeatureGate>` unlocks gated cards
