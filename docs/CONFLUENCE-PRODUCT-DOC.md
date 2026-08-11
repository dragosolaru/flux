# Flux — Documentație Tehnică de Produs

> **Sursă:** repository `dragosolaru/flux` · branch `main` (production) și `claude/check-progress-status-Ezloj` (development)
> **Ultima verificare:** 2026-07-05 · TypeScript ✅ · ESLint ✅ · 117/117 teste ✅

---

## 1. Ce este Flux

Platformă de management pentru mașini electrice. Funcționează cu **orice EV** pentru hărți de încărcare, planificare de rute, urmărirea costurilor și încărcare inteligentă. Pentru **Tesla** adaugă comenzi live și date de telemetrie în timp real.

Aplicația rulează în două moduri:
- **Demo (mock)** — simulator determinist de vehicul, fără mașină reală conectată
- **Live** — date reale prin Tesla Fleet API, activat prin variabila `LIVE_INTEGRATIONS`

---

## 2. Stack tehnologic

| Componentă | Tehnologie |
|---|---|
| Framework | Next.js 16.2.6 (App Router) |
| UI | React 19.2.4, Tailwind CSS, Framer Motion |
| Autentificare | NextAuth v5 (beta) — Google OAuth + email/parolă |
| Bază de date | Supabase (PostgreSQL + PostGIS + RLS) |
| State management | TanStack Query v5 |
| Internaționalizare | next-intl v4 — 5 limbi |
| AI / OCR | Anthropic Claude (parsare documente) |
| Hosting | Vercel (aplicație) + Fly.io (proxy Tesla) |
| Testare | Vitest (unit) + Playwright (e2e) |

**Comenzi:** `npm run dev` · `build` · `lint` · `typecheck` · `test` · `test:e2e`

---

## 3. Structura aplicației

### Pagini (17)

| Zonă | Pagini |
|---|---|
| Public | landing (`/`), `pricing`, `connect/tesla` |
| Autentificare | `login`, `register` |
| Dashboard | `dashboard`, `garage`, `commands`, `charging`, `charging-map`, `map`, `trip`, `costs`, `documents`, `energy`, `insights`, `settings`, `about-data` |

### API (57 rute)

| Grup | Rute principale |
|---|---|
| Auth | `auth/[...nextauth]`, `auth/register` |
| Vehicule | `vehicles`, `vehicles/[id]/{state,commands,stats,charging-history,battery-health,weather}` |
| Seif documente | `vehicles/[id]/vault`, `.../[docId]/{add-to-costs,dismiss}`, `.../calendar` |
| Tesla | `tesla/{connect,callback,refresh,command,vehicle}`, `tesla-public-key` |
| Încărcare | `chargers`, `chargers/{nearby,search,stats,[id]}` |
| Rute | `trip-plan`, `saved-routes`, `saved-routes/[routeId]`, `geocode` |
| Costuri | `costs`, `costs/export`, `documents`, `documents/{inbound-email,inbound-whatsapp,recover}`, `exchange-rates` |
| Tarife | `tariffs/prices`, `tariffs/settings` |
| Notificări | `push/{subscribe,test,vapid-public-key}`, `me/notification-preferences` |
| Billing | `billing/{checkout,portal,webhook}` |
| Utilizator | `me/{capabilities,preferences}`, `user/{export,delete}`, `feedback` |
| Sistem | `cron/poll-vehicles`, `internal/{warm,ingest-stats}` |

---

## 4. Funcționalități

### 4.1 Vehicule și comenzi

**Simulator mock** — motor determinist pe bază de tick-uri, 4 scenarii de utilizare, interpolare multi-pas. Fiecare vehicul primește istoric generat pe 12 luni (curse, sesiuni de încărcare, facturi) ca dashboard-ul să arate viu de la prima vizită.

**Comenzi Tesla** — 26 de tipuri: blocare/deblocare, climatizare + temperatură, claxon, faruri, limită de încărcare, pornire/oprire încărcare, port de încărcare, geamuri, mod santinelă, pornire de la distanță, programare încărcare/plecare, precondiționare baterie, trimitere navigație.

Fiecare comandă e filtrată prin `BrandCapabilities`. Actualizări optimiste de cache cu revenire la eroare.

⚠️ **Important pentru live:** mașinile Model 3/Y/S/X fabricate după 2021 necesită semnarea comenzilor prin Vehicle Command Protocol. Fără proxy-ul desfășurat, comenzile eșuează cu `VCP_REQUIRED` (HTTP 412).

### 4.2 Planificator de rute (trip planner)

Planificare în stil ABRP: origine → destinație, cu opriri de încărcare calculate automat.

- **3 variante** de traseu: cea mai rapidă / cele mai puține opriri / cea mai ieftină
- **Rutare pe drumuri reale** (OSRM), nu linii drepte
- **Derating realist**: temperatură (curbă pe segmente), vânt, viteză
- **Scoring stații**: filtrează stațiile offline/incompatibile; penalizează ocolul și prețul
- **Badge de fiabilitate** pe fiecare stație (verificat recent / învechit / offline)
- **Vreme reală** prin Open-Meteo, cache 30 min

**Trimite la Tesla** — un singur apel `share_navigation` cu toate opririle ca puncte de trecere (nu segment cu segment). Precondiționarea bateriei se declanșează automat pentru orice stație DC non-Tesla; la Superchargere o gestionează Tesla intern.

**Rute salvate** — până la 10 rute per utilizator, denumite automat "Origine → Destinație", redenumibile. Accesibile din 3 locuri: sidebar desktop, deasupra formularului mobil, și în mânerul panoului de rezultate. Varianta aleasă se păstrează la reîncărcare.

### 4.3 Costuri și documente (Cost Intelligence)

**Pipeline OCR** — încarci poză sau PDF → Supabase Storage → Claude Vision (două treceri: energie + auto) → înregistrare structurată de cost.

**Trei căi de intrare:**
1. Încărcare directă din aplicație (poză sau PDF)
2. Email — adresă dedicată per vehicul (Cloudmailin)
3. WhatsApp — webhook Twilio

**Atribuire factură casnică** — din factura de curent a casei se extrage proporțional kWh-ul mașinii.

**Seif documente** — documentele de mașină (talon, RCA, ITP) cu categorii și calendar de expirări. Bonurile de energie detectate primesc un card care întreabă dacă să fie adăugate la costuri, cu opțiune de respingere fără ștergere.

**Metrici** — cost/km separat casă/public/combinat, comparație cu benzina, economii, echivalent CO₂.

### 4.4 Hartă de încărcare

Date PostGIS cu import în masă per țară. Deduplicare a stațiilor coincidente, scoring de încredere, urmărirea disponibilității. Fallback în cascadă: platformă → OpenChargeMap → Overpass.

### 4.5 Încărcare inteligentă

Curbe de preț pe oră, recomandare de fereastră optimă de încărcare. Integrare Tibber pregătită (necesită token); restul furnizorilor sunt curbe mock.

### 4.6 Internaționalizare și monedă

**5 limbi:** română, engleză, germană, franceză, maghiară.
**8 monede:** RON, EUR, USD, GBP, CHF, NOK, SEK, DKK — cu curs BNR.

**Regulă obligatorie:** orice cheie nouă se adaugă simultan în toate cele 5 fișiere din `src/lib/i18n/locales/`.

### 4.7 Notificări

Web Push (VAPID), email (Resend), WhatsApp (Twilio). Livrate dark în spatele flag-ului `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`.

---

## 5. Securitate

### Reguli obligatorii (din `CLAUDE.md`)

1. Fiecare rută API → `auth()` + verificare `session?.user?.id` prima dată
2. Fiecare interogare pe date de utilizator → `.eq("user_id", session.user.id)`
3. `getValidAccessToken(vehicleId, userId)` — mereu cu `userId` (verifică proprietatea intern)
4. Redirecturi `callbackUrl` → validare `startsWith("/")` înainte de `router.replace()`
5. Secrete webhook → doar header `x-webhook-secret`, niciodată query params. Eșuează închis (503) dacă nu e configurat
6. Rate limiting → `checkRateLimit(userId, bucket, max)`

### Stare verificată

✅ Toate cele 57 de rute API respectă regulile. Singurele două fără `auth()` — `internal/warm` și `internal/ingest-stats` — sunt rute mașină-la-mașină protejate prin secret de cron/webhook cu comparație în timp constant și eșuare închisă.

✅ Tokenii Tesla sunt criptați la rest (AES-256-GCM).
✅ RLS activat pe toate tabelele; tabelele partajate au RLS fără politici (doar service-role).
✅ Rate limiting pe toate rutele de scriere.

---

## 6. Bază de date

33 de migrații în `supabase/migrations/`. Tabele principale:

| Tabelă | Rol |
|---|---|
| `profiles` | Extinde `auth.users` |
| `vehicles` | Vehicule per utilizator (mock sau live) |
| `tesla_tokens` | Tokeni OAuth criptați |
| `vehicle_snapshots` | Istoric stare vehicul |
| `mock_vehicle_state` | Stare simulator (o linie per vehicul) |
| `trips` | Curse cu distanță, energie, eficiență |
| `charging_sessions` | Sesiuni de încărcare cu cost și rețea |
| `documents` | Fișiere încărcate + date parsate AI |
| `energy_costs` | Înregistrări structurate de cost |
| `saved_routes` | Rute salvate (max 10/utilizator) |
| `chargers` + tabele conexe | Date PostGIS stații |
| `command_events` | Audit log comenzi |

⚠️ **Nu există runner CI de migrații.** Se aplică manual în Supabase SQL Editor.

**De aplicat acum:** `031_enable_rls_charger_tables.sql`, `032_saved_routes.sql`, `033_saved_routes_index.sql`.
Fără 032, salvarea rutelor returnează eroare 500 în producție.

---

## 7. Deployment și configurare

### Variabile de mediu esențiale

| Variabilă | Scop |
|---|---|
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Autentificare (lipsa lor = eroare `Configuration`) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Bază de date |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login Google |
| `ANTHROPIC_API_KEY` | Pipeline OCR |
| `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_REDIRECT_URI` | Tesla Fleet API |
| `TESLA_TOKEN_ENCRYPTION_KEY` | Criptare tokeni (32 bytes hex) |
| `TESLA_PROXY_BASE_URL` | Proxy semnare comenzi (Fly.io) |
| `LIVE_INTEGRATIONS` | Comutator mock → live (ex. `tesla`) |

### Pași pentru integrarea Tesla live

1. Cont aprobat pe developer.tesla.com → setează credențialele
2. Generează `TESLA_TOKEN_ENCRYPTION_KEY`
3. Publică cheia publică la `/.well-known/appspecific/com.tesla.3p.public-key.pem` (deja servită)
4. **Desfășoară `tesla-proxy` pe Fly.io** (instrucțiuni în `tesla-proxy/README.md`)
5. Setează `TESLA_PROXY_BASE_URL`
6. Setează `LIVE_INTEGRATIONS=tesla`
7. Test end-to-end: OAuth → pairing Virtual Key → citire stare → comandă → navigație

---

## 8. Stare curentă și priorități

### Verificat funcțional

| Verificare | Rezultat |
|---|---|
| TypeScript | ✅ Fără erori |
| ESLint | ✅ Fără erori/avertismente |
| Teste unitare | ✅ 117/117 |
| Paritate development ↔ main | ✅ Identice |
| Acoperire auth pe rute | ✅ 57/57 |
| Chei i18n în 5 limbi | ✅ Complet |

### Blocante pentru lansare

1. **Migrațiile Supabase** (031, 032, 033) — de aplicat manual, ~2 minute
2. **Proxy Tesla pe Fly.io** — fără el comenzile nu merg pe mașini post-2021
3. **Limite de abonament** — dezactivate pentru demo, marcate `TODO(live)` în `src/lib/subscription.ts`

### Prioritățile următoare

1. Tarife reale Tibber (token necesar)
2. Sincronizare automată a istoricului de încărcare (acum e buton manual)
3. Estimare State of Health pentru Tesla live (acum returnează null)
4. Imagini/siluete de vehicul în garaj
5. Gate CI pentru testele Playwright

---

## 9. Documentație în repository

| Fișier | Conținut |
|---|---|
| `CLAUDE.md` / `AGENTS.md` | Reguli obligatorii pentru dezvoltare |
| `CODEBASE_CONTEXT.md` | Hartă arhitectură și fișiere |
| `docs/FEATURES.md` | Catalog complet de funcționalități |
| `docs/LAUNCH-CHECKLIST.md` | Pași go-live |
| `docs/SECURITY-AUDIT.md` | Audit de securitate |
| `docs/VEHICLE-CONNECTION.md` | Flux conectare Tesla |
| `docs/COST-INTELLIGENCE.md` | Pipeline OCR și costuri |
| `docs/SIMULATOR.md` | Motor mock |
| `docs/TODO.md` | Backlog priorizat |
| `docs/USER-RESEARCH-2026-06-11.md` | 25 de persona-uri evaluate |
| `tesla-proxy/README.md` | Desfășurare proxy semnare comenzi |
