# Tasks — Mobile UX Simplify

## 1. Bottom Nav (4 taburi)

- [x] 1.1 `BottomNav.tsx`: TABS → Car · Charging · Trip · More (eliminat Costs, Energy)
- [x] 1.2 `grid-cols-5` → `grid-cols-4`
- [x] 1.3 Import `Route`, eliminat `Receipt`/`Zap` nefolosite
- [x] 1.4 i18n `nav.mobile.trip` în toate 5 locale

## 2. More sheet (SlideUpMenu)

- [x] 2.1 Eliminat Trip din MENU_ITEMS (e în bară acum)
- [x] 2.2 Adăugat Costs + Energy în MENU_ITEMS
- [x] 2.3 Import `Receipt`/`Zap`, eliminat `Route`

## 3. Trip Planner — formular comprimat (map-first)

- [x] 3.1 State `optionsOpen` (default închis)
- [x] 3.2 Slider baterie + selector mașină mutate în disclosure "Opțiuni"
- [x] 3.3 Prima interacțiune = doar origine → destinație → Plan
- [x] 3.4 i18n `trip.options` în toate 5 locale
- [x] 3.5 Corectat calc înălțime hartă pt `safe-area-inset-top` (notch)

## 4. Harta stații — pins doar pe rută

- [x] 4.1 Verificat: `TripMap` randează deja DOAR `activePlan.stops` (cele alese),
      nu toată rețeaua. Înainte de plan: doar origine/destinație. Nicio
      schimbare necesară — comportament deja corect.

## 5. Verificare

- [x] 5.1 `npx tsc --noEmit` curat
- [x] 5.2 `npm run lint` curat
- [x] 5.3 JSON valid în toate 5 locale
- [ ] 5.4 Test manual pe iPhone — **post-deploy**
