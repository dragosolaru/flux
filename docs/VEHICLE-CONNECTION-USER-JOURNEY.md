# Vehicle Connection — User Journey & Authorization Guide

> **Audiență**: product, engineering, founders  
> **Status**: Document de planificare — implementare brand-by-brand conform roadmap  
> **Ultima actualizare**: mai 2026

---

## 1. Principiul fundamental

Flux nu stochează niciodată username-ul sau parola contului OEM al utilizatorului.

Toată autoriza­rea se face prin **OAuth 2.0** — același standard folosit de "Login cu Google". Utilizatorul se autentifică direct pe site-ul producătorului auto, aprobă permisiunile, și revine în Flux cu un token de acces criptat.

```
┌─────────────────────────────────────────────────────────────────┐
│  Ce stochează Flux                                              │
│                                                                 │
│  ✓  access_token  (AES-256-GCM, scadent 8h)                    │
│  ✓  refresh_token (AES-256-GCM, durată lungă)                   │
│  ✗  parola OEM — NICIODATĂ                                      │
│  ✗  PIN mașină  — NICIODATĂ                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. User Journey — de la mock la live

### Starea curentă: Mașini mock

Orice vehicul adăugat în Flux funcționează pe un simulator intern (Tier-3). Datele sunt realiste dar generate — nu vin de la mașina reală. Utilizatorul vede un chip **MOCK** pe dashboard.

### Pasul 1 — Utilizatorul vrea date reale

```
┌─────────────────────────────────────────────────────────────┐
│  Garage — Aurora (Polestar 2)                    [MOCK] ⓘ  │
│                                                             │
│  Baterie: 67%  ·  Autonomie: 312 km  ·  Parcate           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔗  Conectează mașina reală                         │   │
│  │  Primești date live, istoric real de încărcare       │   │
│  │  și costuri exacte — fără estimări.       [Conectează]│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Pasul 2 — Ecranul de conectare (per brand)

Utilizatorul apasă **Conectează**. Flux detectează brand-ul și afișează:

```
┌──────────────────────────────────────────────────┐
│  Conectează Polestar 2 — Aurora                  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  [Logo Polestar]                           │  │
│  │                                            │  │
│  │  Vei fi redirecționat la Polestar.com      │  │
│  │  pentru a-ți autoriza contul.              │  │
│  │                                            │  │
│  │  Flux va putea citi:                       │  │
│  │  ✓ Starea bateriei și autonomia            │  │
│  │  ✓ Istoricul sesiunilor de încărcare       │  │
│  │  ✓ Istoricul tripurilor                    │  │
│  │  ✓ Locația curentă (aproximativă)          │  │
│  │                                            │  │
│  │  Flux NU va putea:                         │  │
│  │  ✗ Accesa setările contului tău            │  │
│  │  ✗ Efectua plăți                           │  │
│  │  ✗ Vedea datele personale                  │  │
│  │                                            │  │
│  │         [Continuă la Polestar.com]         │  │
│  └────────────────────────────────────────────┘  │
│  [Anulează]                                      │
└──────────────────────────────────────────────────┘
```

### Pasul 3 — Consent pe site-ul OEM

Utilizatorul se loghează cu contul lui de la producător (Tesla, Polestar, BMW etc.) și apasă **Allow** / **Autorizează** / **Permite acces**.

*Flux nu vede și nu atinge niciodată acest ecran — se întâmplă 100% pe serverele OEM.*

### Pasul 4 — Redirect înapoi în Flux

OEM redirecționează la `/api/<brand>/callback`. Flux:
1. Schimbă codul de autorizare cu `access_token` + `refresh_token`
2. Criptează tokenii (AES-256-GCM) și îi salvează în Supabase
3. Schimbă `data_source` vehiculului din `mock` → `live`
4. Pornește backfill-ul datelor istorice (ultimele 30 zile)

### Pasul 5 — Confirmare și switch la live

```
┌──────────────────────────────────────────────────────────────┐
│  ✓  Aurora este conectată!                                   │
│                                                              │
│  Datele reale vor apărea în câteva momente.                 │
│  Importăm ultimele 30 zile de istoric de încărcare.         │
│                                                              │
│  [Vezi mașina]                                               │
└──────────────────────────────────────────────────────────────┘
```

Dashboard-ul nu mai afișează **[MOCK]**. Datele sunt reale.

### Pasul 6 — Ce se schimbă după conectare

| Funcție | Înainte (mock) | După (live) |
|---------|---------------|-------------|
| Baterie / Autonomie | Simulată | Reală, actualizată la 30s |
| Sesiuni de încărcare | Generate din scenariu | Din API OEM |
| Istoricul tripurilor | Simulate | Din API OEM |
| Cost Intelligence | Estimat din kWh proporțional | Exact pe baza kWh reali |
| Comenzi (climatizare, blocare) | Simulate (răspuns instant) | Executate pe mașina reală |
| Locație | Ultimul punct din scenariu | GPS live |

---

## 3. Matricea brandurilor — status și complexitate

### Tesla — **DISPONIBIL** (codul există)

| Atribut | Detalii |
|---------|---------|
| API | Tesla Fleet API (official, v1) |
| Auth | OAuth 2.0 + PKCE (implementat în `/api/tesla/`) |
| Acces developer | developer.tesla.com — gratuit, aprobare în 1–5 zile |
| Date disponibile | Telemetrie completă, charging history, trip history, energy reports |
| Comenzi | Toate (climatizare, blocare, honk, sentry) + Virtual Key pentru comenzi fizice |
| Problemă | Virtual Key: necesită aprobare în app Tesla (BLE pairing) pentru comenzi |
| Rate limit | 200 req/vehicle/day (telemetrie polling la 30s e OK) |
| **Efort activare** | **Mic — doar LIVE_INTEGRATIONS=tesla + developer account** |

**Notă Virtual Key (comenzi):**  
Tesla a migrat la un sistem de cheie virtuală din 2023. Pentru a putea executa comenzi (nu doar citire date), utilizatorul trebuie să adauge Flux ca aplicație terță în app-ul Tesla și să aprobe accesul BLE. Flux are deja codul pentru acest flow (`/connect/tesla`).

---

### BMW — **ÎN PREGĂTIRE**

| Atribut | Detalii |
|---------|---------|
| API | BMW Group API / ConnectedDrive |
| Auth | OAuth 2.0 via cont BMW ID |
| Acces developer | developer.bmw.com — aprobare ~2-4 săptămâni, gratuit |
| Date disponibile | Baterie, climatizare, blocare, locație, ultima călătorie |
| Comenzi | Climatizare, blocare, flash (nu honk direct) |
| Limitări | Fără trip history complet; charging history limitat vs Tesla |
| Rate limit | Variat, ~100 req/zi |
| **Efort activare** | **Mediu — necesită înregistrare developer + adapter nou** |

---

### Polestar — **ÎN PREGĂTIRE**

| Atribut | Detalii |
|---------|---------|
| API | Polestar API (beta, în evoluție) |
| Auth | OAuth 2.0 via cont Polestar |
| Acces developer | developer.polestar.com — program recent, aprobare variabilă |
| Date disponibile | Baterie, autonomie, stare încărcare, locație |
| Comenzi | Limitat — climatizare (nu toate modelele) |
| Limitări | Istoric de sesiuni de încărcare mai limitat decât Tesla |
| **Efort activare** | **Mediu** |

---

### Mercedes-Benz — **ÎN PREGĂTIRE**

| Atribut | Detalii |
|---------|---------|
| API | Mercedes-Benz API (developer.mercedes-benz.com) |
| Auth | OAuth 2.0 via Mercedes me account |
| Acces developer | developer.mercedes-benz.com — aprobare în 1–2 săptămâni |
| Date disponibile | Baterie, fuel/range, locație, stare uși, trips, climatizare |
| Comenzi | Blocare, climatizare, auxheat |
| Limitări | Unele modele EQ nu suportă toate endpoint-urile |
| **Efort activare** | **Mediu** |

---

### Volkswagen ID — **ÎN PREGĂTIRE**

| Atribut | Detalii |
|---------|---------|
| API | Volkswagen WeConnect ID API (CARIAD) |
| Auth | OAuth 2.0 via VW ID account |
| Acces developer | Necesită parteneriat CARIAD — mai restrictiv |
| Date disponibile | Baterie, autonomie, charging status, locație |
| Comenzi | Climatizare, blocare |
| Limitări | API mai puțin deschis decât Tesla/Mercedes; necesită parteneriat formal |
| **Efort activare** | **Mare — necesită parteneriat CARIAD** |

---

### Hyundai / Kia — **ÎN PREGĂTIRE**

| Atribut | Detalii |
|---------|---------|
| API | Hyundai BlueLink / Kia Connect API |
| Auth | OAuth 2.0 via cont myHyundai / Kia Connect |
| Acces developer | Program limitat; posibil reverse-engineering necesar inițial |
| Date disponibile | Baterie, autonomie, charging status, locație, climatizare |
| Comenzi | Climatizare, blocare, charge control |
| Limitări | Cel mai puțin documentat din cele 7 branduri; API instabil |
| **Efort activare** | **Mare** |

---

### Renault — **ÎN PREGĂTIRE**

| Atribut | Detalii |
|---------|---------|
| API | My Renault API (Gigya-based) |
| Auth | OAuth 2.0 via cont Renault, autentificare Gigya |
| Acces developer | Nu există program oficial; necesită reverse-engineering |
| Date disponibile | Baterie, autonomie, charging status, locație |
| Comenzi | Climatizare, charge start/stop |
| Limitări | Autentificarea Gigya e complexă; API instabil, fără documentație oficială |
| **Efort activare** | **Foarte mare** |

---

## 4. Ordinea recomandată de activare

```
Lună 1     Lună 2     Lună 3     Lună 4–6   Lună 6+
   │           │           │           │           │
   ▼           ▼           ▼           ▼           ▼
 Tesla      BMW +       VW ID       Hyundai     Renault
(gata)    Polestar   Mercedes      / Kia      (complex)
```

**Prioritizare bazată pe:**
- Mărimea bazei de utilizatori EV în România/Europa
- Maturitatea API-ului și accesul developer
- Efortul de implementare
- Disponibilitatea charging history (crucial pentru Cost Intelligence)

---

## 5. Ce se întâmplă cu datele istorice

Când un utilizator conectează mașina, Flux face un **backfill** (import) al datelor istorice:

```
Data conectare: 15 iunie 2026
                         │
    ┌────────────────────┼────────────────────┐
    ▼                    ▼                    ▼
-30 zile            Data conectare       Înainte
15 mai 2026         15 iun 2026

Backfill:
• Sesiuni de încărcare (cu kWh, rețea, cost dacă disponibil)
• Tripuri (distanță, consum)
• Stări baterie (eșantioane)

Mock-ul devine arhivă:
• Datele mock din trecut rămân, marcate [SIMULATED]
• De la data conectării, datele sunt [LIVE]
```

**Per brand — ce date istorice sunt disponibile:**

| Brand | Charging history | Trip history | kWh per sesiune | Cost per sesiune |
|-------|-----------------|--------------|-----------------|-----------------|
| Tesla | ✓ până la 2 ani | ✓ | ✓ | Parțial (SuperCharger) |
| BMW | ✓ 90 zile | Parțial | ✓ | ✗ |
| Polestar | ✓ 30 zile | ✗ | ✓ | ✗ |
| Mercedes | ✓ 90 zile | ✓ | ✓ | ✗ |
| VW ID | ✓ 30 zile | Parțial | ✓ | ✗ |
| Hyundai | ✓ 30 zile | ✗ | Parțial | ✗ |
| Renault | ✓ 30 zile | ✗ | ✓ | ✗ |

---

## 6. Impact asupra Cost Intelligence

Cu mașina conectată, **Cost Intelligence devine mult mai precisă**:

### Înainte (mock / fără conexiune)
```
Factura acasă: 350 kWh, 210 lei
↓ Estimare
Sesiuni mock din perioada facturii: 87 kWh
↓ Proporție
Cost auto ≈ (87/350) × 210 = 52 lei  ← ESTIMAT
```

### După (mașina conectată)
```
Factura acasă: 350 kWh, 210 lei
↓ Date reale din OEM API
Sesiuni reale de acasă: 91.3 kWh (exact, din telemetrie)
↓ Calcul precis
Cost auto = (91.3/350) × 210 = 54.8 lei  ← REAL
```

**Supercharger Tesla**: Tesla raportează costul direct în API-ul lor (pentru conturile cu card configurat). Deci bonul de la SuperCharger nu trebuie uploadat — vine automat.

---

## 7. Securitate și privacy

### Ce stochează Flux
```
vehicles table:
  tesla_access_token_enc   ← AES-256-GCM encrypted
  tesla_refresh_token_enc  ← AES-256-GCM encrypted
  tesla_token_expires_at   ← timestamp plain
```

### Ce NU stochează Flux
- Parola contului OEM
- PIN-ul mașinii
- Chei de criptare în cod (TESLA_TOKEN_ENCRYPTION_KEY în env var)
- Date de plată / card

### Revocare acces
Utilizatorul poate deconecta mașina în orice moment:
1. Din Flux: Settings → vehicul → Deconectează
2. Din app-ul OEM: revocă accesul aplicației terțe Flux
3. Oricare din cele două invalidează tokenii

---

## 8. Experiența pentru utilizatorul nou (full journey)

```
PRIMA VIZITĂ
─────────────
1. Aterizare pe flux.app
2. Sign up (Google sau email)
3. Onboarding modal: "Adaugă prima mașină"
4. Alege brand → model → nickname
5. ✓ Mașina apare cu date MOCK imediat
   (nu trebuie să conecteze nimic pentru a vedea produsul)

DUPĂ CE ÎȘI DĂ SEAMA CĂ VREA DATE REALE
──────────────────────────────────────────
6. Garage → buton "Conectează mașina reală"
7. Ecran de prezentare permisiuni (clar, fără jargon)
8. Redirect la OEM → Login + Allow
9. Redirect înapoi la Flux
10. Confirmare + backfill pornit

PRIMELE 5 MINUTE CU DATE REALE
────────────────────────────────
11. Dashboard actualizat cu baterie reală
12. Notificare: "Am importat X sesiuni de încărcare"
13. Costs → datele reale apar în Cost Intelligence
14. Dacă are factură recentă → o uploadează → atribuire exactă

UTILIZARE ZILNICĂ
──────────────────
15. Deschide Flux → vede starea mașinii (actualizat la 30s)
16. Când primește factura lunii → o fotografiază → trimite pe email
17. Costul lunar apare automat în dashboard
18. La final de an → raport complet cost/km vs benzină
```

---

## 9. Pași tehnici necesari pentru activarea Tesla (cel mai simplu)

Tesla este singurul brand cu codul complet implementat. Pașii pentru a activa:

1. **developer.tesla.com** → Creează aplicație → Obții `CLIENT_ID` + `CLIENT_SECRET`
2. **Vercel** → Adaugă env vars:
   ```
   LIVE_INTEGRATIONS=tesla
   TESLA_CLIENT_ID=<id>
   TESLA_CLIENT_SECRET=<secret>
   TESLA_REDIRECT_URI=https://flux.vercel.app/api/tesla/callback
   TESLA_TOKEN_ENCRYPTION_KEY=<32 bytes hex>
   ```
3. **Tesla developer dashboard** → Setează `redirect_uri` la URL-ul de mai sus
4. **Opțional**: configurează Tesla HTTP Proxy pentru comenzi pe Model 3/Y/S/X post-2021
   (necesar pentru Virtual Key — documentat în `tesla-proxy/README.md`)

Utilizatorii Tesla vor vedea automat butonul "Conectează" în locul MOCK chip-ului.

---

## 10. Mesaje utilizator (copy suggestions)

### Buton conectare
> "Conectează mașina reală — primești date live și costuri exacte"

### Ecran permisiuni (generic)
> "Flux va citi starea bateriei, istoricul de încărcare și tripurile tale. Nu vom accesa niciodată parola, setările contului sau datele financiare."

### Post-conectare
> "✓ [Nickname] este conectat! Importăm ultimele 30 zile de date."

### Revocare
> "Ai deconectat [Nickname]. Datele existente rămân salvate. Poți reconecta oricând."

### Eroare token expirat
> "Conexiunea cu [Brand] a expirat. Reconectează-ți mașina pentru a continua să primești date live."
