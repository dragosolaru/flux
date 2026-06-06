# Mobile UX Simplify — navigație, trip planner, hartă stații

## Why

Flux e 90% mobil, dar fluxurile sunt alambicate. Feedback direct utilizator +
studiu pe date reale (JD Power 2025–2026, EAFO, Baymard, NNGroup) confirmă 3
probleme:

1. **Bottom Nav încărcat** — 5 taburi + drawer "More" la 2 tap-uri. 73% din
   utilizatori ignoră complet "More" (NNGroup: hidden nav e cel mai slab pe
   toate metricile). Trip planner e îngropat acolo deși 70%+ îl vor. Settings
   apare în 2 locuri (TopBar + More) — confuz.
2. **Trip Planner supraîncărcat** — formular (origine + destinație + slider +
   selector mașină) peste hartă peste pins peste rezultate = 4 straturi
   simultane. 44% din non-Tesla nu au folosit niciodată trip planning =
   problemă de friction, nu de interes.
3. **Harta cu stații zgomotoasă** — toate stațiile rețelei sunt pins pe hartă
   înainte de planificare. Baymard: info overload = cauza #1 de abandon.

## Ce se schimbă

### 1. Bottom Nav: 4 taburi, fără "More"

```
ÎNAINTE                          DUPĂ
Car | Charge | Cost |            Car | Trip | Cost | More(sheet)
Energy | More→drawer
```

- Promovăm **Trip** în bara principală (era îngropat în More).
- Eliminăm tab-urile redundante din bară: Energy intră în secțiunea Cost/Money.
- "More" rămâne ca **sheet** (nu tab plin) doar pentru: Commands, Charging Map,
  Energy, Settings, About — dar Settings NU se mai dublează (rămâne și în
  TopBar dropdown ca azi; scoatem duplicarea logică prin a-l păstra într-un
  singur loc primar = More sheet, TopBar rămâne pentru profil/sign-out).

Notă: păstrăm "More" ca **bottom sheet contextual** (pattern aprobat de
NNGroup pentru depth), nu ca tab care înlocuiește ecranul. 4 taburi vizibile
acoperă 80%+ din uzul zilnic.

### 2. Trip Planner: map-first, formular comprimat

- La intrare se vede **harta** + un singur câmp de căutare flotant (destinație).
- Originea default = locația curentă (geolocation) sau primul câmp expandabil.
- Slider baterie + selector mașină mută într-un rând secundar care apare doar
  când utilizatorul atinge "opțiuni" — nu blochează prima interacțiune.
- Rezultatele rămân ca bottom sheet (deja există), dar formularul nu mai e un
  bloc mare deasupra hărții la prima deschidere.

### 3. Harta stații: pins doar pe ruta planificată

- Înainte de planificare: harta e curată (doar origine/destinație când există).
- După planificare: apar DOAR stațiile alese (stops), nu toată rețeaua.
- Componenta `TripMap` primește deja `stops`; verificăm că nu randează stații
  în plus înainte de plan.

## Impact

- Afectează: `BottomNav.tsx`, `SlideUpMenu.tsx`, `trip-client.tsx`, `TripMap.tsx`.
- i18n: chei noi pentru taburi/More în toate 5 limbile (dacă apar etichete noi).
- Fără dependențe noi. Fără schimbări de schemă DB. Fără API nou.
- KISS: nu refactorizăm logica de planificare, doar prezentarea.
