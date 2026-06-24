# Car-Admin Integrations — Research & Strategy

> Scope: extend Flux beyond EVs into a full "car admin hub" — insurance (RCA/CASCO),
> vignettes (rovinietă + EU), bridge tolls, local car tax, ITP, renewal reminders,
> and non-EV/hybrid vehicle support.
>
> Researched 2026-06-21 by three parallel agents (web research). **Primary market:
> Romania.** Confidence is flagged per claim. Many Romanian gov/insurer sites block
> automated fetching (HTTP 403), so figures marked *Medium/Low* rest on search
> snippets and **must be re-verified against primary sources before they drive real
> calculations, billing, or contracts.**

> **Implementation status (verified in code, 2026-06-23):** This is a **strategy/research**
> document — none of the external partner APIs below (vignette aggregators, insurance
> brokers, VIN decoders, tax/ITP services) are integrated; there are no related env vars or
> clients in `src/`. What *is* built today is the foundation the sequencing in §7 calls for:
> a per-vehicle **document vault** (`/api/vehicles/[id]/vault` + `…/vault/calendar` +
> `…/vault/[documentId]`), **car-document OCR** that already extracts the relevant types
> (`src/lib/ai/prompts/car-document-extraction.ts`, `document-triage.ts`; the parser enum in
> `src/lib/ai/document-parser.ts` includes `rca`, `casco`, `itp`, `rovinieta`, `vignette`,
> `bridge_toll`, `car_tax`, `service`, `fine`, `leasing`, etc.), and an **alert/reminder
> engine** (`src/lib/notifications/alert-engine.ts`). Everything past that — buying vignettes,
> selling insurance, VIN decoding, tax estimation — is **planned**, not implemented.

## TL;DR — how we integrate & who we contract with

| Domain | Verify API? | Sell/Buy API? | Recommended partner / path | Commission |
|---|---|---|---|---|
| **EU vignettes + RO rovinietă + RO bridge toll** | ❌ no official verify API | ✅ yes (aggregator) | **Vignette ID Partner API** (sandbox today; covers `at ch si hu sk cz ro bg md`). Alt: **Autopay** (ASFINAG-licensed), **tolltickets** (enterprise) | margin baked into the price the API returns (negotiated, not public) |
| **RCA / CASCO insurance** | ⚠️ public web form only (AIDA), no API | ✅ via broker partner | **Secondary intermediary under Safety Broker** (the eMAG/OLX model) or **embedded via Qover** (pan-EU API) | RCA ~7% (capped); CASCO higher/uncapped — we get a negotiated *share* |
| **ITP (technical inspection)** | ❌ captcha form (RAR), no API | n/a | manual entry + rule-based interval; deep-link to RAR | — |
| **Local car tax (impozit)** | ❌ no API | ❌ no pay-on-behalf API | compute estimate (Codul Fiscal Art. 470) + deep-link to **Ghișeul.ro** | — |
| **Non-EV/hybrid spec data** | n/a | ✅ paid VIN decoder | **vindecoder.eu** or **CarDataTrend** (EU fuel type/cmc/Euro class); vPIC free US fallback; always allow manual `talon` entry | — |

**Headline:** the only domain with a clean, ready-to-integrate "buy + earn commission, one
integration, includes Romania" path is **vignettes/tolls via a pan-EU aggregator**. Insurance
is a **partnership/regulatory** play, not a plug-in API. Tax/ITP have **no usable public API** —
design around manual entry + computation + deep-links.

---

## 1. Vignettes, rovinietă & bridge tolls

### Romania (rovinietă + Fetești–Cernavodă / Calafat–Vidin), CNAIR
- **No official public API** to buy or verify. Buying is via `erovinieta.ro` / eTarife app;
  verifying is a captcha web form (`cnadnr.ro/ro/verificare-rovinieta`, plate + VIN). *High.*
- Becoming a **CNAIR-authorized distributor** is contract-based (existing ones: Banca
  Transilvania, Poșta Română, OMV Petrom, MOL, Rompetrol, UNTRR, Scala Assistance /
  roviniete.ro / taxadepod.ro). **Unauthorized resale is prohibited.** Commission % not
  published — must contact CNAIR. *High / Medium.*
- Bridge toll (peaj) uses the same authorized-distributor framework; ~13 RON/car/crossing
  in 2026; payable via erovinieta, SMS 7577, and since 2025 **ghișeul.ro**. *High.*
- **2026 regulatory note:** flat rovinietă stays for ≤3.5t (our consumer audience). >3.5t
  moves to distance-based **TollRo** (~Oct 2026). *High.*

### EU aggregators (the realistic API path — all include `ro`)
- **Vignette ID** (`vignette.id` / `e-vignettes.eu`) — **STRONGEST FIT.** Real Partner API
  with **sandbox + production**: bearer auth, covered-countries / products / create-order /
  `GET /orders/{id}/status` + **webhooks** (`ORDER_STATUS_CHANGED`). Buying is fully
  programmatic. **Commission is baked into the price the API returns** (negotiated per
  partner). Covers AT/CH/SI/HU/SK/CZ/**RO**/BG/MD + Austrian tunnels. Onboard via partner
  form → sandbox keys. Contact `work+api+support@vignette.id`. *High.*
- **Autopay Mobility** (`mobility.autopay.eu`, docs `docs.autopay.com`) — Partner API
  (OAuth2). Covers AT/CH/CZ/SK/SI/HU/**RO**/BG. One of only **three ASFINAG-licensed**
  sellers of Austrian vignettes — strong legitimacy. Commission not public. *High coverage /
  Medium API detail.*
- **tolltickets** (`tolltickets.com`) — established (since 2007, ~15 countries incl. RO),
  enterprise B2B (powers Audi's toll box). Sales-led onboarding, no self-serve API docs. *Medium.*
- **TollGuru** — developer API but **price calculation only, not resale**. Useful for in-app
  cost estimation. *High (calc only).*
- **Eurotoll / Toll4Europe / DKV / SkyToll(emyto)** — EETS, heavy-goods/OBU; only relevant
  if Flux ever targets >3.5t. *Medium.*

**Verification caveat:** no clean verify API anywhere. Aggregator order-status only covers
vignettes *we* sold; verifying an arbitrary plate's rovinietă needs a CNAIR data agreement or
fragile scraping. *High.*

**Next action:** request sandbox from **Vignette ID** + **Autopay** in parallel; compare
commission %. Separately email CNAIR if we want first-party RO branding/legitimacy.

---

## 2. Insurance — RCA & CASCO

### Verification (AIDA, run by BAAR)
- Official RCA database is **AIDA** (`aida.info.ro`, successor to CEDAM). Public, **free**
  web check by **plate or VIN** → insurer + policy series + expiry. Also AIDA.info mobile
  apps. *High.*
- **No public/documented API for third parties.** A restricted insurer/authority API may
  exist but is undocumented (contact BAAR). New policies take 1–3 days to appear. *High / Medium.*
- Only concrete third-party data API found: **`evita-amenzi.ro` "API Înmatriculare"** —
  REST, key auth, returns RCA validity + ITP + vignette + VIN + make/model. **Single-source,
  vendor-described; verify data provenance/legality/ToS** (likely scrapes AIDA). *Medium.*
- **Cleanest verify path:** once Flux is a broker partner, get RCA validity + bonus-malus
  through the partner's quoting integration (no scraping).

### Selling RCA/CASCO (regulated — ASF framework, Law 236/2018 / IDD)
You cannot legally intermediate insurance outside the ASF framework. Three tiers, lightest → heaviest:

1. **Secondary intermediary ("asistent în brokeraj") — RECOMMENDED.** Sign a mandate with an
   existing broker; broker registers Flux in **RIS** (`ris.asfromania.ro`); Flux operates
   under the broker's responsibility. **This is exactly how eMAG/OLX/Autovit sell insurance
   (powered by Safety Broker).** Needs CAEN 6622, distribution staff pass the **ISF exam**,
   ASF issues an RAF/RAJ code. *High.*
2. **Registered agent** (tied to one/few insurers) — mid-weight. *Medium.*
3. **Full ASF-authorized broker** — heaviest (own authorization, PI insurance, CSA reporting
   via eSimba/asiguram software). **Avoid for v1.** *High.*

**Pure affiliate / lead-gen** (redirect, no advice) may avoid ASF registration entirely —
but the line between "advertising" and "distribution" must be drawn by **Romanian
insurance counsel**. *Medium.*

### Partners
- **Safety Broker** — largest RO RCA broker, proven brokerage-assistant model (eMAG/OLX);
  **most likely partner.** Partner program exists; API specifics need a call. *High / Medium.*
- **Transilvania Broker** — affiliate/collaborator program with commission structures. *High.*
- **Qover (Belgium)** — **API-first / white-label embedded**, licensed in 32 EU countries
  incl. **Romania**, does MTPL (=RCA), MOD (≈CASCO), GAP. Best **embedded** candidate; carries
  much of the compliance load. Confirm RO compulsory-RCA availability (tightly regulated). *High / Medium.*
- **Cover Genius (XCover)** — global embedded, revenue-share; best for **ancillary** auto
  (warranty, GAP, roadside), not mandatory RCA. *Medium.*

### Commission
- RCA **~7%** (regulation-capped, printed on the policy). CASCO **uncapped/higher**. As a
  secondary intermediary we get a **negotiated share** of the broker's commission, not the full %. *Medium.*

**Next action:** open parallel conversations with **Safety Broker** (sell + data) and **Qover**
(embedded API); get RO insurance counsel to classify our flow (distribution vs advertising).

---

## 3. ITP (Inspecția Tehnică Periodică) — RAR

- **No API.** RAR has only a **captcha web form** (`prog.rarom.ro/rarpol/`) keyed by **CIV
  series or VIN** (plate alone not accepted). Third-party "verificare ITP" sites are scrapers,
  not licensed APIs. *High.*
- **Design:** user **enters ITP expiry manually** (from the sticker/CIV); app **computes the
  next due date** from the interval rule and reminds. Optionally deep-link to RAR.
- **Interval rule** (derive from registration date + usage flag): first ITP at **3 years**;
  age **3–12 yrs → every 2 years**; **>12 yrs → annually**; **taxi/rental/ride-share → every
  6 months**. *High.*

---

## 4. Local car tax (impozit pe mijloacele de transport)

- **Computable** via Codul Fiscal **Art. 470**: `ceil(cmc / 200) × rate_per_200cmc`
  (each 200 cmc group, or fraction, rounds up). Base legal rates per 200 cmc:
  - ≤1600: **8 lei** · 1601–2000: **18** · 2001–2600: **72** · 2601–3000: **144** · >3000: **290**.
  - Examples: 1400 cmc → 7×8 = 56 lei; 1650 → 9×18 = 162 lei. *High.*
- **EV: flat 40 lei/year.** Hybrid/PHEV: new **≤50 g/km CO₂** threshold may get up to **30%
  reduction** (council discretion). *High / Medium.*
- **Caveats:** each **local council** sets the actual multiplier (historically up to +50%) →
  Flux can only show an **estimate** unless it stores per-locality rates. **2026 Law 239/2025
  + OUG 78/2025** add a **EURO-norm pollution coefficient** — exact 2026 multipliers were
  **not confirmable** (Low; verify against final law text before shipping the estimator). *High / Low.*
- **Deadlines (for reminders):** two installments **31 March** & **30 September** (50% each);
  **~10% bonus** for paying the full year by **31 March**. *High.*
- **Payment APIs:** **Ghișeul.ro (SNEP)** has **no public developer/reseller API**
  (integration is institution-side); **ANAF** APIs are fiscal/e-Factura, not *local* vehicle
  tax; each **DITL** council has its own portal. **No pay-on-behalf path.** *Medium / High.*
- **Design:** estimate locally → remind before 31 March → **deep-link to Ghișeul.ro / DITL**.

---

## 5. Renewal reminders — engine design

- **Per-item fields:** `type` (RCA/CASCO/rovinietă/ITP/impozit/EU-vignette/extinguisher/
  first-aid), `valid_from`, `expiry_date` (anchor), `last_renewed_at`, derived
  `vehicle_age`/`usage_category` (ITP), fixed `due_date` (tax), `status`
  (active/expiring/expired/dismissed), `reminder_lead_days[]`, `last_notified_at`,
  optional `document_url`.
- **Laddered lead times:** insurance (RCA/CASCO) **~60/30/7** (time to shop rates, avoid a
  gap); fixed deadlines (tax 31 Mar) **30/7/1** + a nudge at the 10%-bonus cutoff; short
  validity (rovinietă 7/30-day) compressed. Stop the ladder on "done" (or detected new expiry). *High.*
- **Channels:** push + email primary; SMS for time-critical if budget allows; one dashboard
  with traffic-light status; "done" via document upload of the renewed cert. *High.*

---

## 6. Non-EV & hybrid vehicle data (VIN → fuel type, cmc, Euro class)

- **vindecoder.eu (Vincario)** — best EU fit. 50+ fields incl. **fuel type, displacement,
  Euro class, avg CO₂**. Free trial ~20 lookups, then paid credits. VIN-in only (no RO
  plate→VIN). *High / Medium.*
- **CarDataTrend** (`vin.cardatatrend.com`) — EU decoder: powertrain, fuel type, WLTP CO₂,
  Euro class, battery; handles partial VINs. *Medium.*
- **NHTSA vPIC** — free, no key, but **US-biased**; for EU VINs returns make/year reliably,
  often **misses fuel type/cmc**. Use as a free fallback only. *High.*
- **RAR** holds authoritative RO data but **no API** (AutoPass is per-report). *High.*
- **Design:** paid EU decoder (vindecoder/CarDataTrend) for fuel type + cmc + Euro class
  (exactly what the tax estimator + ITP logic need) → **always allow manual override from the
  `talon`/CIV**, which carries cmc + Euro norm anyway (fallback + accuracy win).

---

## 7. Recommended sequencing (non-binding)

1. **Reminders + manual document vault first** — pure Flux build, no partner/regulatory
   dependency, immediately useful, and the backbone everything else hangs off.
2. **Non-EV/hybrid vehicle support** — add fuel type/cmc/Euro fields (VIN decoder + manual),
   unlocks the tax estimator.
3. **Tax estimator + ITP scheduler** — computation + deep-links, no API risk.
4. **Vignettes/tolls** — integrate **Vignette ID** sandbox (first real revenue via API).
5. **Insurance** — slowest (ASF/partner): start Safety Broker + Qover conversations early,
   ship behind the reminders/vault once the mandate + compliance are in place.

> Re-verify all *Medium/Low* figures (2026 tax coefficients, commission %, decoder pricing,
> aggregator country/commission specifics) against primary sources before they drive money or
> calculations.
