# Tasks — Cost Intelligence

Plan fazat. Fiecare fază livrează o felie funcțională și lasă `main` deployabil.

---

## Faza 1 — Schema DB + migrare

- [ ] 1.1 Scrie migrarea SQL cu tabelele `documents`, `energy_costs`, `exchange_rates`
- [ ] 1.2 Adaugă coloanele `cost_ron`, `cost_source` la `charging_sessions`
- [ ] 1.3 Adaugă politici RLS pentru `documents` și `energy_costs`
- [ ] 1.4 Creează bucket Supabase Storage `documents` (private, max 10MB per fișier)
- [ ] 1.5 Rulează migrarea în Supabase și verifică schema
- [ ] 1.6 Adaugă tipurile TypeScript pentru noile tabele în `src/types/costs.ts`

---

## Faza 2 — Integrare BNR Exchange Rate

- [ ] 2.1 Creează `src/lib/external/bnr/client.ts` — fetch XML de la `https://www.bnr.ro/nbrfxrates.xml`
- [ ] 2.2 Implementează `parseBNRXml(xml: string): Record<string, number>` (parse XML simplu, fără librărie extra)
- [ ] 2.3 Implementează `getExchangeRate(currency, date)` cu cache în tabelul `exchange_rates`
- [ ] 2.4 Adaugă fallback la ziua anterioară (weekenduri și sărbători BNR nu publică)
- [ ] 2.5 Creează `src/lib/external/bnr/types.ts` cu tipurile necesare
- [ ] 2.6 Test manual: verifică că EUR→RON returnează valoare rezonabilă

---

## Faza 3 — Parser AI cu Claude

- [ ] 3.1 Adaugă `@anthropic-ai/sdk` la dependențe (`npm install @anthropic-ai/sdk`)
- [ ] 3.2 Creează `src/lib/ai/prompts/document-extraction.ts` cu promptul de extragere (din design.md)
- [ ] 3.3 Creează `src/lib/ai/document-parser.ts` cu funcția `parseDocument(doc)`
  - [ ] 3.3a Download fișier din Supabase Storage
  - [ ] 3.3b Conversie la base64
  - [ ] 3.3c Apel Claude multimodal (tip `image` pentru imagini, `document` pentru PDF)
  - [ ] 3.3d Parsare și validare JSON output cu Zod
  - [ ] 3.3e Returnează `ParsedDocument` tipizat
- [ ] 3.4 Creează `src/lib/costs/types.ts` — interfețe `ParsedDocument`, `ExtractedCost`, `DocumentStatus`
- [ ] 3.5 Adaugă `ANTHROPIC_API_KEY` la `.env.local.example` (dacă nu există)
- [ ] 3.6 Test manual cu o imagine de bon și un PDF de factură — verifică JSON output

---

## Faza 4 — Attribution + Session Matching

- [ ] 4.1 Creează `src/lib/costs/attribution.ts`
  - [ ] 4.1a `attributeHomeBill(vehicleId, periodStart, periodEnd, totalKwh, costRon)` — calculează fracția auto
  - [ ] 4.1b Sesiunile acasă = `charging_sessions` cu `network IS NULL` în intervalul perioadei
- [ ] 4.2 Creează `src/lib/costs/session-matcher.ts`
  - [ ] 4.2a `matchChargingSession(vehicleId, timestamp, toleranceMinutes=15)` — găsește sesiunea cea mai apropiată
  - [ ] 4.2b Returnează `{ sessionId, deltaMinutes }` sau `null`
- [ ] 4.3 Creează `src/lib/costs/processor.ts` — funcția principală `processDocument(documentId)`
  - [ ] 4.3a Update status → `processing`
  - [ ] 4.3b Apelează `parseDocument()`
  - [ ] 4.3c Conversie valutară cu `getExchangeRate()`
  - [ ] 4.3d Branching: `home_bill` → `attributeHomeBill()` / `public_receipt` → `matchChargingSession()`
  - [ ] 4.3e Insert în `energy_costs`
  - [ ] 4.3f Dacă `public_receipt` și sesiune găsită → update `charging_sessions.cost_ron`
  - [ ] 4.3g Update `documents.status` → `done` sau `needs_review` (dacă confidence < 0.7 pe câmpuri critice)
  - [ ] 4.3h Gestionare erori → status `error`, log `error_message`

---

## Faza 5 — API Routes

- [ ] 5.1 Creează `src/app/api/documents/route.ts`
  - [ ] 5.1a `POST` — upload fișier: validare Zod, upload Storage, insert `documents`, trigger procesare async
  - [ ] 5.1b `GET ?vehicleId=` — lista documentelor pentru vehicul, sortate descendent
- [ ] 5.2 Creează `src/app/api/documents/[documentId]/route.ts`
  - [ ] 5.2a `GET` — detaliu document cu `parsed_json`
  - [ ] 5.2b `PATCH` — editare manuală: update `energy_costs` și marchează `is_manually_edited = true`
- [ ] 5.3 Creează `src/app/api/costs/route.ts`
  - [ ] 5.3a `GET ?vehicleId=&from=&to=` — agregare pentru dashboard: cost total, kWh, split, trend lunar
- [ ] 5.4 Validare Zod la fiecare route (input + output tipizat)
- [ ] 5.5 Auth check la fiecare route (sesiune + ownership vehicul)

---

## Faza 6 — Hooks TanStack Query

- [ ] 6.1 Creează `src/hooks/useDocuments.ts`
  - [ ] 6.1a `useDocuments(vehicleId)` — lista cu polling 3s când există `pending|processing`
  - [ ] 6.1b `useUploadDocument()` — mutation pentru upload
  - [ ] 6.1c `useEditDocument()` — mutation pentru corecție manuală
- [ ] 6.2 Creează `src/hooks/useCosts.ts`
  - [ ] 6.2a `useCosts(vehicleId, from?, to?)` — agregare pentru dashboard

---

## Faza 7 — UI: Costs page + componente

- [ ] 7.1 Creează `src/app/(dashboard)/costs/page.tsx` — Server Component cu fetch inițial
- [ ] 7.2 Creează `src/app/(dashboard)/costs/costs-client.tsx` — Client Component principal
- [ ] 7.3 Creează `src/components/costs/DocumentUploadZone.tsx`
  - [ ] 7.3a Drag-and-drop + click-to-select
  - [ ] 7.3b Preview imagine după selectare
  - [ ] 7.3c Progress bar upload
  - [ ] 7.3d Validare client-side (tip fișier, dimensiune)
- [ ] 7.4 Creează `src/components/costs/DocumentStatusCard.tsx`
  - [ ] 7.4a Stări: pending (spinner), processing (spinner animat), done (✓ + date), needs_review (⚠ + edit), error (✗ + mesaj)
  - [ ] 7.4b Date extrase: provider, perioadă, kWh, cost RON
  - [ ] 7.4c Buton Edit → inline form pentru corecție manuală
- [ ] 7.5 Creează `src/components/costs/CostDashboard.tsx`
  - [ ] 7.5a `CostPerKmCard` — acasă vs public vs medie
  - [ ] 7.5b `HomeSplitCard` — procentaj acasă/public (progress bar)
  - [ ] 7.5c `MonthlyCostChart` — grafic simplu trend 12 luni (recharts sau SVG nativ)
  - [ ] 7.5d `FuelComparisonCard` — EV cost vs benzină echivalent (7L/100km × prețul mediu benzină)
- [ ] 7.6 Adaugă **Costs** în sidebar (`src/components/layout/Sidebar.tsx`) între Charging și Energy
  - [ ] 7.6a Icoană: `Receipt` din lucide-react
  - [ ] 7.6b Link activ când `pathname.startsWith("/costs")`

---

## Faza 8 — Email inbound (v2, post-launch)

> Această fază nu se implementează în v1. E documentată pentru continuitate.

- [ ] 8.1 Alege provider inbound email gratuit (Resend Inbound sau Mailgun trial)
- [ ] 8.2 Configurează domeniu și rute: `bills@flux.app` → webhook
- [ ] 8.3 Creează `src/app/api/documents/inbound-email/route.ts` — primește webhook, extrage attachment-uri
- [ ] 8.4 Identificare vehicul: parse adresă de tip `flux+<nickname>-<vehicleId>@flux.app`
- [ ] 8.5 Afișează adresa email unică per vehicul în Settings → secțiunea mașinii
- [ ] 8.6 Fallback: dacă adresa nu are prefix vehicul, caută nickname în subject

---

## Ordine de implementare recomandată

```
Faza 1 (DB) → Faza 2 (BNR) → Faza 3 (Claude parser)
    → Faza 4 (Attribution) → Faza 5 (API)
    → Faza 6 (Hooks) → Faza 7 (UI)
```

Fazele 1–4 pot fi testate izolat cu scripturi înainte de UI.
Faza 7 poate începe în paralel cu 5–6 folosind date mock locale.
