# Flux — Go-Live Checklist (clienți reali + Tesla API live)

_Ultima actualizare: 2026-07-05_

Ordinea de mai jos este ordinea recomandată de execuție. Pașii 1–2 durează
minute; pasul 3 (Tesla) este singura lucrare de infrastructură reală.

---

## 1. Supabase — migrații manuale (obligatoriu, ~2 min)

Repo-ul nu are runner CI de migrații; acestea se aplică manual în
**Supabase Dashboard → SQL Editor**. De aplicat (idempotente):

- [ ] `031_enable_rls_charger_tables.sql` — RLS pe tabelele partajate.
      **Fără ea, cheia publică anon dă citire/scriere pe `chargers`,
      `charger_connectors`, `charger_sources`, `ingest_runs`, `exchange_rates`
      prin PostgREST.**
- [ ] `032_saved_routes.sql` — tabela rute salvate (**fără ea, salvarea rutelor dă 500 în producție**)
- [ ] `033_saved_routes_index.sql` — index `user_id`
- [ ] `034_dedupe_chargers_by_site.sql` — colapsează stațiile duplicate deja
      stocate (dedup-ul din cod previne duplicate noi, dar nu le repară pe
      cele existente)

## 1b. Upstash Redis — OBLIGATORIU, nu opțional

Fără `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`:

- **Rate limiting cade pe memoria instanței** (`src/lib/rate-limit.ts`) — se
  resetează la fiecare cold start, deci pe serverless practic nu limitează
  nimic. Afectează direct costul OCR/Anthropic.
- **Fiecare citire de hartă reface ingest-ul complet** (`repository.ts`
  `ensureAreaFresh`) — toate tile-urile par învechite, deci fiecare pan pe hartă
  declanșează OCM + Overpass + TomTom inline. Latență de secunde și consum de
  cotă la furnizori.
- **Cron-ul de warm reia mereu capul listei** — `isCountryFresh` întoarce mereu
  fals, deci țările de la coadă nu se importă niciodată.

- [ ] `UPSTASH_REDIS_REST_URL`
- [ ] `UPSTASH_REDIS_REST_TOKEN`

## 2. Vercel — variabile de mediu (producție)

Minim pentru funcționare (auth-ul a picat deja o dată din cauza lor):

- [ ] `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- [ ] `NEXTAUTH_URL` — `https://flux-alpha-three.vercel.app` (sau domeniul final)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` + redirect URI `…/api/auth/callback/google` în Google Cloud Console
- [ ] `ANTHROPIC_API_KEY` — pipeline-ul OCR pentru costuri
- [ ] `TOMTOM_API_KEY` — fără ea conectorul TomTom întoarce gol în tăcere;
      se pierde ~o treime din acoperirea stațiilor plus datele de putere per
      conector. Notă: TomTom contribuie doar pe calea leneșă (tile), nu în
      importul bulk — vezi comentariul din `src/lib/chargers/ingest/bulk.ts`.
- [ ] `CRON_SECRET` — fără ea rutele de cron eșuează închis (503)
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID` — necesare
      înainte de a încasa bani
- [ ] Opționale: `OPENROUTESERVICE_API_KEY`, `CHARGEPRICE_API_KEY`,
      `TIBBER_TOKEN`, `OPEN_CHARGE_MAP_API_KEY`, `INGEST_WEBHOOK_SECRET`

## 3. Tesla Fleet API — integrare live (blocker pentru comenzi reale)

1. - [ ] Cont aprobat pe [developer.tesla.com](https://developer.tesla.com); setează
     `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_REDIRECT_URI`
     (`https://<domeniu>/api/tesla/callback`) în Vercel.
2. - [ ] `TESLA_TOKEN_ENCRYPTION_KEY` — `openssl rand -hex 32` (criptare tokeni la rest).
3. - [ ] Cheia publică de semnare publicată la
     `/.well-known/appspecific/com.tesla.3p.public-key.pem` (deja servită de app).
4. - [ ] **Deploy `tesla-proxy` pe Fly.io** — vezi `tesla-proxy/README.md`
     (fly launch → `fly secrets set TESLA_PRIVATE_KEY=…` → fly deploy).
     Fără el, comenzile pe Model 3/Y/S/X post-2021 pică cu `VCP_REQUIRED` (412).
5. - [ ] `TESLA_PROXY_BASE_URL=https://flux-tesla-proxy.fly.dev` în Vercel.
6. - [ ] `LIVE_INTEGRATIONS=tesla` în Vercel — comută brand-ul Tesla de pe mock pe live
     (`src/lib/live-integrations.ts`).
7. - [ ] Test end-to-end cu o mașină reală: conectare OAuth → Virtual Key pairing →
     citire stare → lock/unlock → share_navigation.

## 4. Comercial — înainte de primii clienți plătitori

- [ ] Reactivează limitele pe tier în `src/lib/subscription.ts`
      (marcat `TODO(live)` — limitele de documente sunt dezactivate pentru demo).
- [ ] Stripe: chei live + webhook secret (migrarea 013 există deja).
- [ ] `CRON_SECRET` + cron-urile Vercel (poll-vehicles) dacă activezi notificările
      (`NEXT_PUBLIC_NOTIFICATIONS_ENABLED=true`).

## 5. Nice-to-have imediat după lansare (din docs/TODO.md)

1. Tarife reale (Tibber `TIBBER_TOKEN`; restul provider-ilor rămân curbe mock).
2. Sincronizare automată istoric încărcare (acum e buton manual).
3. SoH estimat pentru Tesla live (acum `null`).
